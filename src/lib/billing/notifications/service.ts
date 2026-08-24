import { createHmac, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { maskPhone, normalizePhone } from '@/lib/auth/phone';
import { prisma } from '@/lib/db';
import { addDays, addGracePeriod } from '@/lib/billing/periods';
import { billingLog, billingMetric } from '@/lib/billing/log';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export const BILLING_NOTIFICATION_TYPES = {
  subscriptionActivated: 'subscription_activated',
  renewalDue30d: 'renewal_due_30d',
  renewalDue7d: 'renewal_due_7d',
  renewalDue1d: 'renewal_due_1d',
  subscriptionExpired: 'subscription_expired',
  graceEnding: 'grace_ending',
  renewalSuccess: 'renewal_success',
} as const;

export type BillingNotificationType =
  (typeof BILLING_NOTIFICATION_TYPES)[keyof typeof BILLING_NOTIFICATION_TYPES];

type NotificationTemplate = {
  code: string;
  params: Record<string, string>;
};

type ScheduleInput = {
  id: string;
  userId: string;
  status: string;
  billingCycle: string;
  currentPeriodEnd: Date;
  gracePeriodEnd: Date | null;
  autoRenew: boolean;
  user: { phone: string | null; renewalReminderSmsEnabled: boolean };
  billingPlan: { name: string } | null;
};

const STALE_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAYS_MS = [5 * 60 * 1000, 30 * 60 * 1000] as const;
const MAX_ATTEMPTS = 3;
const LEASE_MINUTES = 5;
const CHINA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

function requiredTemplateCode(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new Error(`${name} is not configured`);
  return value.trim();
}

function dateInChina(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`;
}

function templateFor(
  type: BillingNotificationType,
  plan: string,
  periodEnd: Date,
  gracePeriodEnd: Date,
): NotificationTemplate {
  if (type === BILLING_NOTIFICATION_TYPES.subscriptionActivated) {
    return {
      code: requiredTemplateCode(
        'ALIBABA_CLOUD_SMS_TEMPLATE_SUBSCRIPTION_ACTIVATED',
        process.env.ALIBABA_CLOUD_SMS_TEMPLATE_SUBSCRIPTION_ACTIVATED,
      ),
      params: { plan, endDate: dateInChina(periodEnd) },
    };
  }
  if (type === BILLING_NOTIFICATION_TYPES.renewalSuccess) {
    return {
      code: requiredTemplateCode(
        'ALIBABA_CLOUD_SMS_TEMPLATE_RENEWAL_SUCCESS',
        process.env.ALIBABA_CLOUD_SMS_TEMPLATE_RENEWAL_SUCCESS,
      ),
      params: { plan, endDate: dateInChina(periodEnd) },
    };
  }
  if (type === BILLING_NOTIFICATION_TYPES.subscriptionExpired) {
    return {
      code: requiredTemplateCode(
        'ALIBABA_CLOUD_SMS_TEMPLATE_SUBSCRIPTION_EXPIRED',
        process.env.ALIBABA_CLOUD_SMS_TEMPLATE_SUBSCRIPTION_EXPIRED,
      ),
      params: {
        plan,
        endDate: dateInChina(periodEnd),
        graceDate: dateInChina(gracePeriodEnd),
      },
    };
  }
  if (type === BILLING_NOTIFICATION_TYPES.graceEnding) {
    return {
      code: requiredTemplateCode(
        'ALIBABA_CLOUD_SMS_TEMPLATE_GRACE_ENDING',
        process.env.ALIBABA_CLOUD_SMS_TEMPLATE_GRACE_ENDING,
      ),
      params: { plan, graceDate: dateInChina(gracePeriodEnd) },
    };
  }
  return {
    code: requiredTemplateCode(
      'ALIBABA_CLOUD_SMS_TEMPLATE_RENEWAL_DUE',
      process.env.ALIBABA_CLOUD_SMS_TEMPLATE_RENEWAL_DUE,
    ),
    params: { plan, endDate: dateInChina(periodEnd) },
  };
}

function isAdvanceReminder(type: string): boolean {
  return type.startsWith('renewal_due_');
}

function phoneHash(phone: string): string {
  const secret = process.env.SMS_CODE_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error('SMS_CODE_SECRET or AUTH_SECRET is required');
  return createHmac('sha256', secret).update(`billing-sms:${phone}`).digest('hex');
}

function isFreshEnough(scheduledAt: Date, now: Date): boolean {
  return scheduledAt.getTime() >= now.getTime() - STALE_REMINDER_WINDOW_MS;
}

/** Move SMS delivery into China's 09:00-20:00 service-notification window. */
export function normalizeBillingSmsTime(value: Date): Date {
  const chinaClock = new Date(value.getTime() + CHINA_UTC_OFFSET_MS);
  const hour = chinaClock.getUTCHours();
  if (hour >= 9 && hour < 20) return value;
  if (hour >= 20) chinaClock.setUTCDate(chinaClock.getUTCDate() + 1);
  chinaClock.setUTCHours(9, 30, 0, 0);
  return new Date(chinaClock.getTime() - CHINA_UTC_OFFSET_MS);
}

export function buildNotificationSchedule(subscription: ScheduleInput, now: Date) {
  if (subscription.autoRenew) return [];
  const periodEnd = subscription.currentPeriodEnd;
  const graceEnd = subscription.gracePeriodEnd ?? addGracePeriod(periodEnd);
  const rows: Array<{
    subscriptionId: string;
    userId: string;
    type: BillingNotificationType;
    periodEnd: Date;
    scheduledAt: Date;
  }> = [];

  const add = (type: BillingNotificationType, scheduledAt: Date, skipIfStale = true) => {
    if (!skipIfStale || isFreshEnough(scheduledAt, now)) {
      rows.push({
        subscriptionId: subscription.id,
        userId: subscription.userId,
        type,
        periodEnd,
        scheduledAt: normalizeBillingSmsTime(scheduledAt),
      });
    }
  };

  if (subscription.user.renewalReminderSmsEnabled && subscription.status === 'active') {
    if (subscription.billingCycle === 'yearly') {
      add(BILLING_NOTIFICATION_TYPES.renewalDue30d, addDays(periodEnd, -30));
    }
    add(BILLING_NOTIFICATION_TYPES.renewalDue7d, addDays(periodEnd, -7));
    add(BILLING_NOTIFICATION_TYPES.renewalDue1d, addDays(periodEnd, -1));
  }

  if (subscription.status === 'active' || subscription.status === 'past_due') {
    add(BILLING_NOTIFICATION_TYPES.subscriptionExpired, periodEnd, false);
    add(BILLING_NOTIFICATION_TYPES.graceEnding, addDays(graceEnd, -1));
  }

  return rows;
}

export async function enqueueSubscriptionPaymentNotification(
  tx: Tx,
  input: {
    subscriptionId: string;
    userId: string;
    periodEnd: Date;
    purchaseType: 'new' | 'upgrade' | 'manual_renewal';
    now: Date;
  },
) {
  const type = input.purchaseType === 'manual_renewal'
    ? BILLING_NOTIFICATION_TYPES.renewalSuccess
    : BILLING_NOTIFICATION_TYPES.subscriptionActivated;
  await tx.billingNotification.upsert({
    where: {
      subscriptionId_type_periodEnd: {
        subscriptionId: input.subscriptionId,
        type,
        periodEnd: input.periodEnd,
      },
    },
    create: {
      subscriptionId: input.subscriptionId,
      userId: input.userId,
      type,
      periodEnd: input.periodEnd,
      scheduledAt: normalizeBillingSmsTime(input.now),
    },
    update: {},
  });

  await tx.billingNotification.updateMany({
    where: {
      subscriptionId: input.subscriptionId,
      periodEnd: { not: input.periodEnd },
      status: { in: ['scheduled', 'processing'] },
    },
    data: {
      status: 'canceled',
      lockedBy: null,
      lockedUntil: null,
    },
  });
}

export async function materializeBillingNotifications(now = new Date()): Promise<{
  transitionedToGrace: number;
  scheduled: number;
}> {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      autoRenew: false,
      status: { in: ['active', 'past_due'] },
      billingPlanId: { not: null },
    },
    include: {
      user: { select: { phone: true, renewalReminderSmsEnabled: true } },
      billingPlan: { select: { name: true } },
    },
  });

  let transitionedToGrace = 0;
  const rows: ReturnType<typeof buildNotificationSchedule> = [];
  for (const record of subscriptions) {
    let subscription: ScheduleInput = record;
    if (record.status === 'active' && record.currentPeriodEnd <= now) {
      const gracePeriodEnd = record.gracePeriodEnd ?? addGracePeriod(record.currentPeriodEnd);
      const changed = await prisma.subscription.updateMany({
        where: { id: record.id, status: 'active', currentPeriodEnd: { lte: now } },
        data: { status: 'past_due', gracePeriodEnd },
      });
      if (changed.count === 1) {
        transitionedToGrace += 1;
        subscription = { ...record, status: 'past_due', gracePeriodEnd };
      }
    }
    rows.push(...buildNotificationSchedule(subscription, now));
  }

  const result = rows.length > 0
    ? await prisma.billingNotification.createMany({ data: rows, skipDuplicates: true })
    : { count: 0 };
  return { transitionedToGrace, scheduled: result.count };
}

type ClaimedNotification = Prisma.BillingNotificationGetPayload<{
  include: {
    subscription: { include: { user: true; billingPlan: true } };
  };
}>;

async function claimNotifications(workerId: string, batchSize: number): Promise<ClaimedNotification[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "BillingNotification" AS notification
    SET "status" = 'processing',
        "lockedBy" = ${workerId},
        "lockedUntil" = now() + interval '${Prisma.raw(String(LEASE_MINUTES))} minutes',
        "attempts" = "attempts" + 1,
        "updatedAt" = now()
    WHERE "id" IN (
      SELECT "id" FROM "BillingNotification"
      WHERE (
          ("status" = 'scheduled' AND "scheduledAt" <= now())
          OR ("status" = 'processing' AND "lockedUntil" IS NOT NULL AND "lockedUntil" < now())
        )
        AND "attempts" < ${MAX_ATTEMPTS}
        AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
      ORDER BY "scheduledAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"
  `);
  if (rows.length === 0) return [];
  return prisma.billingNotification.findMany({
    where: { id: { in: rows.map((row) => row.id) } },
    include: { subscription: { include: { user: true, billingPlan: true } } },
  });
}

function canSend(record: ClaimedNotification, now: Date): boolean {
  const subscription = record.subscription;
  if (subscription.currentPeriodEnd.getTime() !== record.periodEnd.getTime()) return false;
  if (isAdvanceReminder(record.type)) {
    return subscription.status === 'active' && subscription.user.renewalReminderSmsEnabled;
  }
  if (record.type === BILLING_NOTIFICATION_TYPES.subscriptionExpired) {
    return subscription.status === 'past_due' && Boolean(
      subscription.gracePeriodEnd && subscription.gracePeriodEnd > now,
    );
  }
  if (record.type === BILLING_NOTIFICATION_TYPES.graceEnding) {
    return subscription.status === 'past_due' && Boolean(
      subscription.gracePeriodEnd && subscription.gracePeriodEnd > now,
    );
  }
  return subscription.status === 'active';
}

async function sendClaimed(record: ClaimedNotification, now: Date): Promise<'sent' | 'failed' | 'suppressed'> {
  const phone = normalizePhone(record.subscription.user.phone);
  if (!phone || !canSend(record, now)) {
    await prisma.billingNotification.update({
      where: { id: record.id },
      data: { status: 'suppressed', lockedBy: null, lockedUntil: null },
    });
    return 'suppressed';
  }

  try {
    const graceEnd = record.subscription.gracePeriodEnd ?? addGracePeriod(record.periodEnd);
    const template = templateFor(
      record.type as BillingNotificationType,
      record.subscription.billingPlan?.name ?? '智链',
      record.periodEnd,
      graceEnd,
    );
    const { deliverAliyunSmsTemplate } = await import('@/lib/auth/sms-providers');
    const receipt = await deliverAliyunSmsTemplate(phone, template.code, template.params);
    await prisma.billingNotification.update({
      where: { id: record.id },
      data: {
        status: 'sent',
        templateCode: template.code,
        phoneMasked: maskPhone(phone),
        phoneHash: phoneHash(phone),
        providerMessageId: receipt.providerMessageId ?? receipt.requestId,
        sentAt: now,
        lastError: null,
        lockedBy: null,
        lockedUntil: null,
      },
    });
    billingMetric('billing_sms_sent_total', {
      notificationId: record.id,
      subscriptionId: record.subscriptionId,
      notificationType: record.type,
    });
    return 'sent';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const terminal = record.attempts >= MAX_ATTEMPTS;
    const retryDelay = RETRY_DELAYS_MS[Math.max(0, record.attempts - 1)] ?? RETRY_DELAYS_MS.at(-1)!;
    await prisma.billingNotification.update({
      where: { id: record.id },
      data: {
        status: terminal ? 'failed' : 'scheduled',
        scheduledAt: terminal ? record.scheduledAt : new Date(now.getTime() + retryDelay),
        lastError: message.slice(0, 1000),
        lockedBy: null,
        lockedUntil: null,
      },
    });
    billingLog('billing_sms_failed', {
      notificationId: record.id,
      subscriptionId: record.subscriptionId,
      notificationType: record.type,
      attempt: record.attempts,
      terminal,
      errorCode: message,
    });
    return 'failed';
  }
}

export async function runBillingNotificationBatch(batchSize = 50) {
  const now = new Date();
  const materialized = await materializeBillingNotifications(now);
  const workerId = `sms-${randomUUID().slice(0, 8)}`;
  const claimed = await claimNotifications(workerId, batchSize);
  const results = { sent: 0, failed: 0, suppressed: 0 };
  for (const record of claimed) {
    const outcome = await sendClaimed(record, now);
    results[outcome] += 1;
  }
  return { workerId, ...materialized, claimed: claimed.length, ...results };
}
