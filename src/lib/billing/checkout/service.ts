// CheckoutSession domain service (spec §4.1, §8, §10).
// A session is one purchase intent + a server-side frozen quote; PaymentOrders
// under it are individual channel attempts.

import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { syncBillingPlans } from '@/lib/billing/service';
import { addBillingCycle, checkoutTtlMinutes } from '@/lib/billing/periods';
import { billingLog, billingMetric } from '@/lib/billing/log';
import {
  BillingError,
  toBillingError,
  type CheckoutSessionStatus,
  type PurchaseType,
} from '@/lib/billing/types';
import { assertCheckoutSessionTransition } from '@/lib/billing/state-machines';
import { calculateCheckoutQuote } from '@/lib/billing/checkout/quote';
import {
  loadCurrentSubscriptionSnapshot,
  resolvePurchaseType,
} from '@/lib/billing/checkout/purchase-type';
import {
  countRedemptions,
  findCouponByCode,
  hasPriorPurchase,
  promotionRuleInput,
  releaseRedemptionsForSessions,
  releaseReservation,
  validateCouponEligibility,
} from '@/lib/billing/promotions/service';
import { listProviderAvailability } from '@/lib/billing/payments/provider';
import { requestHash } from '@/lib/billing/idempotency';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export type CheckoutSessionRecord = Prisma.CheckoutSessionGetPayload<{
  include: {
    billingPlan: true;
    coupon: true;
    paymentOrders: true;
    paymentAgreement: true;
    redemption: true;
  };
}>;

// ─── Period computation (spec §11.2) ────────────────────────────────────────

export type PeriodsResult = { currentPeriodStart: Date; currentPeriodEnd: Date };

export function computePeriods(params: {
  purchaseType: PurchaseType;
  paidAt: Date;
  billingCycle: string;
  existingCurrentPeriodEnd: Date | null;
}): PeriodsResult {
  if (params.purchaseType === 'manual_renewal' && params.existingCurrentPeriodEnd) {
    const anchor = params.existingCurrentPeriodEnd;
    return { currentPeriodStart: anchor, currentPeriodEnd: addBillingCycle(anchor, params.billingCycle) };
  }
  // new + upgrade: restart the period at payment time, no proration (spec §11.3).
  return { currentPeriodStart: params.paidAt, currentPeriodEnd: addBillingCycle(params.paidAt, params.billingCycle) };
}

// ─── Create (spec §8.1) ─────────────────────────────────────────────────────

export async function createCheckoutSession(params: {
  userId: string;
  workspaceId: string;
  planKey: string;
  couponCode?: string | null;
  idempotencyKey: string | null;
  requestBody: unknown;
}): Promise<
  | { type: 'created'; session: CheckoutSessionRecord }
  | { type: 'replay'; session: CheckoutSessionRecord }
> {
  const now = new Date();

  // Idempotency: same key + same body -> replay the stored session. The key is
  // scoped to (userId, workspaceId) — a GLOBAL unique key could hand another
  // user's session to whoever happens to collide on the same key
  // (remediation §4.8).
  if (params.idempotencyKey) {
    const existing = await prisma.checkoutSession.findFirst({
      where: {
        userId: params.userId,
        workspaceId: params.workspaceId,
        idempotencyKey: params.idempotencyKey,
      },
      include: SESSION_INCLUDE,
    });
    if (existing) {
      if (existing.idempotencyRequestHash === hashRequest(params.requestBody)) {
        // Defense in depth: never return a session the caller does not own.
        if (existing.userId !== params.userId || existing.workspaceId !== params.workspaceId) {
          throw toBillingError('NOT_FOUND');
        }
        return { type: 'replay', session: existing };
      }
      throw toBillingError('IDEMPOTENCY_KEY_REUSED');
    }
  }

  await syncBillingPlans();
  const plan = await prisma.billingPlan.findUnique({ where: { key: params.planKey } });
  if (!plan || !plan.isActive) {
    throw toBillingError('PLAN_NOT_FOUND', { planKey: params.planKey });
  }
  if (plan.priceCents <= 0) {
    throw toBillingError('PLAN_NOT_CONFIGURED', { planKey: params.planKey });
  }

  // Structural adapter: the prisma client's overloaded findFirst doesn't match
  // the loose `(args: unknown) => Promise<unknown>` signature directly.
  const currentSubscription = await loadCurrentSubscriptionSnapshot(
    prisma as unknown as Parameters<typeof loadCurrentSubscriptionSnapshot>[0],
    {
      userId: params.userId,
      workspaceId: params.workspaceId,
      module: plan.module,
      now,
    },
  );
  const resolution = resolvePurchaseType({
    currentSubscription,
    targetPlanKey: plan.key,
    now,
  });
  if ('error' in resolution) {
    throw toBillingError(resolution.error);
  }
  const purchaseType: PurchaseType = resolution.purchaseType;

  // Optional coupon: compute the quote only, never consume quota (spec §7.5).
  let coupon: Awaited<ReturnType<typeof findCouponByCode>> = null;
  if (params.couponCode) {
    coupon = await findCouponByCode(prisma, params.couponCode);
    if (!coupon) throw toBillingError('COUPON_NOT_FOUND', { code: params.couponCode });

    const counts = await countRedemptions(prisma, {
      couponId: coupon.id,
      promotionId: coupon.promotion.id,
      userId: params.userId,
      workspaceId: params.workspaceId,
    });
    const priorPurchase = await hasPriorPurchase(prisma, { userId: params.userId });
    const errorCode = validateCouponEligibility({
      coupon,
      promotion: coupon.promotion,
      plan: { key: plan.key, billingCycle: plan.billingCycle, priceCents: plan.priceCents },
      now,
      hasPriorPurchase: priorPurchase,
      counts,
    });
    if (errorCode) {
      billingMetric('billing_coupon_rejected_total', { couponId: coupon.id, errorCode });
      throw toBillingError(errorCode, { code: coupon.code });
    }
  }

  const quote = calculateCheckoutQuote({
    plan: {
      key: plan.key,
      name: plan.name,
      billingCycle: plan.billingCycle,
      module: plan.module,
      priceCents: plan.priceCents,
      currency: plan.currency,
    },
    promotion: coupon ? promotionRuleInput(coupon.promotion) : null,
    coupon: coupon ? { code: coupon.code } : null,
    purchaseType,
    now,
  });

  try {
    const session = await prisma.checkoutSession.create({
      data: {
        idempotencyKey: params.idempotencyKey ?? `auto-${sessionToken()}`,
        idempotencyRequestHash: hashRequest(params.requestBody),
        userId: params.userId,
        workspaceId: params.workspaceId,
        billingPlanId: plan.id,
        sourceSubscriptionId: resolution.sourceSubscriptionId,
        purchaseType,
        status: 'ready',
        currency: quote.currency,
        subtotalCents: quote.subtotalCents,
        discountCents: quote.discountCents,
        amountDueCents: quote.amountDueCents,
        renewalAmountCents: quote.renewalAmountCents,
        planSnapshot: quote.planSnapshot as unknown as Prisma.InputJsonValue,
        discountSnapshot: (quote.discountSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
        couponId: coupon?.id ?? null,
        expiresAt: new Date(now.getTime() + checkoutTtlMinutes() * 60_000),
      },
      include: SESSION_INCLUDE,
    });
    billingMetric('billing_checkout_created_total', {
      checkoutSessionId: session.id,
      purchaseType,
      planKey: plan.key,
    });
    return { type: 'created', session };
  } catch (error) {
    // Lost an idempotency race — replay the winner (same owner scope only).
    if (params.idempotencyKey && isUniqueViolation(error)) {
      const existing = await prisma.checkoutSession.findFirst({
        where: {
          userId: params.userId,
          workspaceId: params.workspaceId,
          idempotencyKey: params.idempotencyKey,
        },
        include: SESSION_INCLUDE,
      });
      if (
        existing &&
        existing.userId === params.userId &&
        existing.workspaceId === params.workspaceId &&
        existing.idempotencyRequestHash === hashRequest(params.requestBody)
      ) {
        return { type: 'replay', session: existing };
      }
    }
    throw error;
  }
}

function sessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function hashRequest(body: unknown): string {
  return requestHash(body);
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2002');
}

// ─── Read / view (spec §8.2) ────────────────────────────────────────────────

const SESSION_INCLUDE = {
  billingPlan: true,
  coupon: true,
  paymentOrders: { orderBy: { attemptNumber: 'desc' } },
  paymentAgreement: true,
  redemption: true,
} as const;

export async function loadOwnedCheckoutSession(params: {
  sessionId: string;
  userId: string;
  workspaceId: string;
}): Promise<CheckoutSessionRecord | null> {
  const session = await prisma.checkoutSession.findUnique({
    where: { id: params.sessionId },
    include: SESSION_INCLUDE,
  });
  // Ownership: both user AND workspace must match (spec §8.2).
  if (!session || session.userId !== params.userId || session.workspaceId !== params.workspaceId) {
    return null;
  }
  return session;
}

export type PaymentAttemptView = {
  id: string;
  provider: string;
  status: string;
  presentation: 'qr_code' | 'redirect' | null;
  codeUrl: string | null;
  redirectUrl: string | null;
  attemptNumber: number;
  expiresAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
};

export type CheckoutSessionView = {
  id: string;
  status: CheckoutSessionStatus;
  purchaseType: PurchaseType;
  currency: string;
  expiresAt: string;
  plan: {
    key: string;
    name: string;
    tier: string | null;
    billingCycle: string;
    module: string;
  };
  quote: {
    currency: string;
    subtotalCents: number;
    discountCents: number;
    amountDueCents: number;
    renewalAmountCents: number;
    discountDuration: 'once' | 'repeating' | null;
  };
  coupon: { code: string; label: string } | null;
  autoRenew: boolean;
  agreementStatus: string | null;
  payment: PaymentAttemptView | null;
  subscription: {
    id: string;
    status: string;
    currentPeriodEnd: string;
    autoRenew: boolean;
    nextBillingAt: string | null;
  } | null;
  providerAvailability: Record<string, { oneTime: boolean; autoRenew: boolean }>;
};

function attemptView(order: CheckoutSessionRecord['paymentOrders'][number] | undefined): PaymentAttemptView | null {
  if (!order) return null;
  const metadata = (order.metadata ?? {}) as {
    presentation?: string;
    codeUrl?: string;
    redirectUrl?: string;
  };
  return {
    id: order.id,
    provider: order.provider,
    status: order.status,
    presentation: (metadata.presentation as 'qr_code' | 'redirect') ?? null,
    codeUrl: metadata.codeUrl ?? null,
    redirectUrl: metadata.redirectUrl ?? null,
    attemptNumber: order.attemptNumber,
    expiresAt: order.expiredAt ? order.expiredAt.toISOString() : null,
    failureCode: order.failureCode ?? null,
    failureMessage: order.failureMessage ?? null,
  };
}

export async function getCheckoutSessionView(params: {
  sessionId: string;
  userId: string;
  workspaceId: string;
}): Promise<CheckoutSessionView | null> {
  const session = await loadOwnedCheckoutSession(params);
  if (!session) return null;
  return await serializeCheckoutSession(session);
}

export async function serializeCheckoutSession(session: CheckoutSessionRecord): Promise<CheckoutSessionView> {
  const planSnapshot = session.planSnapshot as unknown as {
    key: string;
    name: string;
    tier: string | null;
    billingCycle: string;
    module: string;
  };
  const discountSnapshot = session.discountSnapshot as unknown as {
    duration?: 'once' | 'repeating';
  } | null;

  let subscription: CheckoutSessionView['subscription'] = null;
  if (session.status === 'completed') {
    const record = await prisma.subscription.findFirst({
      where: {
        userId: session.userId,
        workspaceId: session.workspaceId,
        module: session.billingPlan.module,
      },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    if (record) {
      subscription = {
        id: record.id,
        status: record.status,
        currentPeriodEnd: record.currentPeriodEnd.toISOString(),
        autoRenew: record.autoRenew,
        nextBillingAt: record.nextBillingAt ? record.nextBillingAt.toISOString() : null,
      };
    }
  }

  return {
    id: session.id,
    status: session.status as CheckoutSessionStatus,
    purchaseType: session.purchaseType as PurchaseType,
    currency: session.currency,
    expiresAt: session.expiresAt.toISOString(),
    plan: {
      key: planSnapshot.key,
      name: planSnapshot.name,
      tier: planSnapshot.tier,
      billingCycle: planSnapshot.billingCycle,
      module: planSnapshot.module,
    },
    quote: {
      currency: session.currency,
      subtotalCents: session.subtotalCents,
      discountCents: session.discountCents,
      amountDueCents: session.amountDueCents,
      renewalAmountCents: session.renewalAmountCents,
      discountDuration: discountSnapshot?.duration ?? null,
    },
    coupon: session.coupon ? { code: session.coupon.code, label: promotionLabel(session) } : null,
    autoRenew: session.autoRenew,
    agreementStatus: session.paymentAgreement?.status ?? null,
    payment: attemptView(session.paymentOrders[0]),
    subscription,
    providerAvailability: listProviderAvailability(),
  };
}

function promotionLabel(session: CheckoutSessionRecord): string {
  const snapshot = session.discountSnapshot as unknown as { promotionName?: string } | null;
  return snapshot?.promotionName ?? '优惠';
}

// ─── Coupon apply / remove (spec §8.3/§8.4) ─────────────────────────────────

async function assertModifiable(session: CheckoutSessionRecord): Promise<void> {
  if (session.status !== 'ready') {
    throw toBillingError('CHECKOUT_SESSION_NOT_MODIFIABLE', { status: session.status });
  }
  if (session.expiresAt <= new Date()) {
    await expireSession(session.id);
    throw toBillingError('CHECKOUT_SESSION_EXPIRED');
  }
}

export async function applyCouponToSession(params: {
  sessionId: string;
  userId: string;
  workspaceId: string;
  code: string;
}): Promise<CheckoutSessionRecord> {
  // Ownership precheck (spec §8.2) — the authoritative re-check happens under
  // the row lock below.
  const owned = await loadOwnedCheckoutSession(params);
  if (!owned) throw toBillingError('NOT_FOUND');

  const now = new Date();

  return prisma.$transaction(
    async (tx: Tx) => {
      // Serialize against concurrent confirm / coupon changes on the same
      // session and re-read status under the lock (remediation §4.6.1/§4.6.2):
      // only a ready, unexpired session may change its coupon.
      await tx.$queryRaw`SELECT * FROM "CheckoutSession" WHERE "id" = ${owned.id} FOR UPDATE`;
      const session = await tx.checkoutSession.findUnique({
        where: { id: owned.id },
        include: SESSION_INCLUDE,
      });
      if (!session) throw toBillingError('NOT_FOUND');
      await assertModifiable(session);
      if (session.expiresAt <= now) throw toBillingError('CHECKOUT_SESSION_EXPIRED');

      const coupon = await findCouponByCode(tx, params.code);
      if (!coupon) {
        billingMetric('billing_coupon_rejected_total', { errorCode: 'COUPON_NOT_FOUND' });
        throw toBillingError('COUPON_NOT_FOUND', { code: params.code });
      }

      const counts = await countRedemptions(tx, {
        couponId: coupon.id,
        promotionId: coupon.promotion.id,
        userId: params.userId,
        workspaceId: params.workspaceId,
      });
      const priorPurchase = await hasPriorPurchase(tx, { userId: params.userId });
      const errorCode = validateCouponEligibility({
        coupon,
        promotion: coupon.promotion,
        plan: {
          key: session.billingPlan.key,
          billingCycle: session.billingPlan.billingCycle,
          priceCents: session.billingPlan.priceCents,
        },
        now,
        hasPriorPurchase: priorPurchase,
        counts,
      });
      if (errorCode) {
        billingMetric('billing_coupon_rejected_total', { couponId: coupon.id, errorCode });
        throw toBillingError(errorCode, { code: coupon.code });
      }

      const quote = calculateCheckoutQuote({
        plan: {
          key: session.billingPlan.key,
          name: session.billingPlan.name,
          billingCycle: session.billingPlan.billingCycle,
          module: session.billingPlan.module,
          priceCents: session.billingPlan.priceCents,
          currency: session.billingPlan.currency,
        },
        promotion: promotionRuleInput(coupon.promotion),
        coupon: { code: coupon.code },
        purchaseType: session.purchaseType as PurchaseType,
        now,
      });

      // Switching coupons: atomically release the OLD reservation and point
      // any existing redemption record at the NEW coupon so only B can be
      // redeemed (remediation §4.6.4 — the record's couponId was never
      // updated before).
      if (
        session.couponId &&
        session.couponId !== coupon.id &&
        session.redemption &&
        session.redemption.status === 'reserved'
      ) {
        await releaseReservation(tx, session.redemption.id);
      }
      if (session.redemption && session.redemption.status === 'reserved' && session.couponId !== coupon.id) {
        await tx.couponRedemption.update({
          where: { id: session.redemption.id },
          data: { couponId: coupon.id, discountCents: quote.discountCents },
        });
      }

      const updated = await tx.checkoutSession.update({
        where: { id: session.id },
        data: {
          couponId: coupon.id,
          discountCents: quote.discountCents,
          amountDueCents: quote.amountDueCents,
          renewalAmountCents: quote.renewalAmountCents,
          discountSnapshot: (quote.discountSnapshot ?? undefined) as Prisma.InputJsonValue | undefined,
        },
        include: SESSION_INCLUDE,
      });
      billingMetric('billing_coupon_apply_total', { couponId: coupon.id, checkoutSessionId: session.id });
      return updated;
    },
    { timeout: 15_000 },
  );
}

export async function removeCouponFromSession(params: {
  sessionId: string;
  userId: string;
  workspaceId: string;
}): Promise<CheckoutSessionRecord> {
  const owned = await loadOwnedCheckoutSession(params);
  if (!owned) throw toBillingError('NOT_FOUND');

  return prisma.$transaction(
    async (tx: Tx) => {
      await tx.$queryRaw`SELECT * FROM "CheckoutSession" WHERE "id" = ${owned.id} FOR UPDATE`;
      const session = await tx.checkoutSession.findUnique({
        where: { id: owned.id },
        include: SESSION_INCLUDE,
      });
      if (!session) throw toBillingError('NOT_FOUND');
      await assertModifiable(session);

      // Releasing the hold is part of the same transaction as the quote reset
      // (remediation §4.6.5 — the old implementation left the reservation
      // dangling until session expiry).
      if (session.redemption && session.redemption.status === 'reserved') {
        await releaseReservation(tx, session.redemption.id);
      }

      return tx.checkoutSession.update({
        where: { id: session.id },
        data: {
          couponId: null,
          discountCents: 0,
          amountDueCents: session.subtotalCents,
          renewalAmountCents: session.subtotalCents,
          discountSnapshot: Prisma.JsonNull,
        },
        include: SESSION_INCLUDE,
      });
    },
    { timeout: 15_000 },
  );
}

// ─── Expiry sweep (opportunistic cron substitute) ───────────────────────────

async function expireSession(sessionId: string): Promise<void> {
  await prisma.checkoutSession.updateMany({
    where: { id: sessionId, status: { in: ['ready', 'processing'] } },
    data: { status: 'expired' },
  });
  await releaseRedemptionsForSessions(prisma, [sessionId]);
  billingMetric('billing_checkout_expired_total', { checkoutSessionId: sessionId });
}

/** Expire overdue ready/processing sessions and release their coupon holds. */
export async function expireStaleSessions(limit = 200): Promise<number> {
  const now = new Date();
  const stale = await prisma.checkoutSession.findMany({
    where: { status: { in: ['ready', 'processing'] }, expiresAt: { lt: now } },
    select: { id: true },
    take: limit,
  });
  if (stale.length === 0) return 0;
  const ids = stale.map((row) => row.id);
  await prisma.checkoutSession.updateMany({
    where: { id: { in: ids } },
    data: { status: 'expired' },
  });
  await releaseRedemptionsForSessions(prisma, ids);
  billingMetric('billing_checkout_expired_total', { count: ids.length });
  return ids.length;
}

export { SESSION_INCLUDE };
