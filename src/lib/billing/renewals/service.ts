// Auto-renewal infrastructure (spec §12). Fully implemented but effectively
// dormant until a payment channel's recurring capability is approved and
// enabled (WECHATPAY_RECURRING_ENABLED / ALIPAY_RECURRING_ENABLED) — without
// an active PaymentAgreement no subscription enters the due set.

import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { billingLog, billingMetric } from '@/lib/billing/log';
import type { BillingProvider } from '@/types/billing';
import { assertRenewalAttemptTransition, assertSubscriptionTransition } from '@/lib/billing/state-machines';
import {
  RENEWAL_MAX_ATTEMPTS,
  addBillingCycle,
  addGracePeriod,
  nextRetryAt,
} from '@/lib/billing/periods';
import { calculateRenewalQuote } from '@/lib/billing/checkout/quote';
import { expireStaleSessions } from '@/lib/billing/checkout/service';
import { getAdapter } from '@/lib/billing/payments/provider';
import type { ChargeAgreementResult, PaymentProviderAdapter } from '@/lib/billing/payments/provider';
import { toBillingError } from '@/lib/billing/types';
import { enqueueSubscriptionPaymentNotification } from '@/lib/billing/notifications/service';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export type RenewalAttemptRecord = Prisma.RenewalAttemptGetPayload<{
  include: { subscription: true; paymentOrder: true };
}>;

/** Idempotency key for renewal charges (spec §12.3). */
export function renewalIdempotencyKey(
  subscriptionId: string,
  periodStart: Date,
  attemptNumber: number,
): string {
  return `renewal:${subscriptionId}:${periodStart.toISOString()}:${attemptNumber}`;
}

/**
 * Renewal amount derived ONLY from subscription snapshots — never live
 * Promotion config (spec §7.6).
 */
export function computeRenewalQuote(subscription: {
  renewalPriceCents: number | null;
  discountSnapshot: unknown;
  discountRemainingCycles: number;
}) {
  const snapshot = subscription.discountSnapshot as {
    discountCents?: number;
    discountType?: string;
    discountValue?: number;
    maximumDiscountCents?: number | null;
    duration?: string;
    durationCycles?: number | null;
  } | null;
  return calculateRenewalQuote({
    // renewalPriceCents is the undiscounted base (remediation §4.5).
    renewalPriceCents: subscription.renewalPriceCents ?? 0,
    discountSnapshot: snapshot
      ? {
          discountCents: snapshot.discountCents ?? 0,
          discountType: snapshot.discountType,
          discountValue: snapshot.discountValue,
          maximumDiscountCents: snapshot.maximumDiscountCents ?? null,
          duration: snapshot.duration ?? 'once',
          durationCycles: snapshot.durationCycles ?? null,
        }
      : null,
    discountRemainingCycles: subscription.discountRemainingCycles ?? 0,
  });
}

// ─── Due subscriptions (spec §12.2) ─────────────────────────────────────────

export async function listDueSubscriptions(now: Date, limit = 50) {
  return prisma.subscription.findMany({
    where: {
      autoRenew: true,
      cancelAtPeriodEnd: false,
      status: { in: ['active', 'past_due'] },
      nextBillingAt: { lte: now },
      paymentAgreement: { status: 'active' },
    },
    include: { paymentAgreement: true, billingPlan: true },
    orderBy: { nextBillingAt: 'asc' },
    take: limit,
  });
}

/**
 * Lazily materialize RenewalAttempt rows for due subscriptions (spec §6.5):
 * attempt 1 at the due date; retries D1/D3 only after a failure. Guarded by
 * @@unique(subscriptionId, periodStart, attemptNumber).
 */
export async function ensureRenewalAttempts(now: Date): Promise<number> {
  const due = await listDueSubscriptions(now);
  let created = 0;

  for (const subscription of due) {
    const periodStart = subscription.currentPeriodEnd;
    const quote = computeRenewalQuote(subscription);

    const last = await prisma.renewalAttempt.findFirst({
      where: { subscriptionId: subscription.id, periodStart },
      orderBy: { attemptNumber: 'desc' },
    });

    if (!last) {
      await prisma.renewalAttempt
        .create({
          data: {
            subscriptionId: subscription.id,
            periodStart,
            periodEnd: addBillingCycle(periodStart, subscription.billingCycle),
            scheduledAt: subscription.nextBillingAt ?? now,
            attemptNumber: 1,
            amountCents: quote.amountCents,
            currency: 'CNY',
            status: 'scheduled',
          },
        })
        .catch((error) => {
          if (!isP2002(error)) throw error;
        });
      created += 1;
      continue;
    }

    // Schedule the successor attempt once the retry time has arrived.
    if (
      last.status === 'retryable_failed' &&
      last.attemptNumber < RENEWAL_MAX_ATTEMPTS &&
      last.nextRetryAt &&
      last.nextRetryAt <= now
    ) {
      await prisma.renewalAttempt
        .create({
          data: {
            subscriptionId: subscription.id,
            periodStart,
            periodEnd: addBillingCycle(periodStart, subscription.billingCycle),
            scheduledAt: last.nextRetryAt,
            attemptNumber: last.attemptNumber + 1,
            amountCents: quote.amountCents,
            currency: 'CNY',
            status: 'scheduled',
          },
        })
        .catch((error) => {
          if (!isP2002(error)) throw error;
        });
      created += 1;
    }
  }

  return created;
}

function isP2002(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2002');
}

// ─── Claim via atomic lease (spec §12.2 + remediation §4.4) ─────────────────

const LEASE_MINUTES = 5;

export async function claimRenewalAttempts(
  workerId: string,
  batchSize = 50,
): Promise<RenewalAttemptRecord[]> {
  // Takeover-aware claim (remediation §4.4): a crashed worker leaves the
  // attempt in 'processing' with an expired lease — the old claim query only
  // matched 'scheduled', so those attempts were stuck forever. Attempts
  // waiting on an async charge result ('awaiting_confirmation') are also
  // re-claimed after their lease lapses so the watchdog can reconcile them.
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    UPDATE "RenewalAttempt" AS ra
    SET "lockedBy" = ${workerId},
        "lockedUntil" = now() + interval '${Prisma.raw(String(LEASE_MINUTES))} minutes',
        "status" = 'processing',
        "startedAt" = COALESCE("startedAt", now()),
        "updatedAt" = now()
    WHERE "id" IN (
      SELECT "id" FROM "RenewalAttempt"
      WHERE (
          ("status" = 'scheduled' AND "scheduledAt" <= now())
          OR ("status" = 'processing' AND "lockedUntil" IS NOT NULL AND "lockedUntil" < now())
          OR ("status" = 'awaiting_confirmation' AND "lockedUntil" IS NOT NULL AND "lockedUntil" < now())
        )
        AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
      ORDER BY "scheduledAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"
  `);

  if (rows.length === 0) return [];
  const ids = rows.map((row) => String(row.id));
  return prisma.renewalAttempt.findMany({
    where: { id: { in: ids } },
    include: { subscription: true, paymentOrder: true },
  });
}

// ─── Renewal payment reconciliation (spec §12.5, webhook or sync path) ──────

export type RenewalReconcileOutcome =
  | 'renewal_activated'
  | 'renewal_already_processed'
  | 'renewal_late_success_requires_review'
  | 'amount_mismatch'
  | 'order_not_found';

/** Runs inside the caller's transaction; the PaymentOrder row is already locked. */
export async function reconcileRenewalPayment(
  tx: Tx,
  params: {
    paymentOrderId: string;
    provider: BillingProvider;
    providerTransactionId: string | null;
    amountCents: number | null;
    paidAt: Date | null;
    paymentEventId: string;
  },
): Promise<
    | 'renewal_activated'
    | 'renewal_already_processed'
    | 'renewal_late_success_requires_review'
    | 'amount_mismatch'
  | 'order_not_found'
> {
  const order = await tx.paymentOrder.findUnique({
    where: { id: params.paymentOrderId },
    include: { renewalAttempt: { include: { subscription: true } } },
  });
  if (!order || !order.renewalAttempt) {
    await markEvent(tx, params.paymentEventId, 'ignored', order?.id ?? null);
    return 'order_not_found';
  }

  const attempt = order.renewalAttempt;
  const subscription = attempt.subscription;

  if (attempt.status === 'succeeded') {
    await markEvent(tx, params.paymentEventId, 'processed', order.id);
    return 'renewal_already_processed';
  }

  if (params.amountCents === null || params.amountCents !== order.amountCents) {
    billingLog('alert', {
      eventType: 'renewal_amount_mismatch',
      paymentOrderId: order.id,
      renewalAttemptId: attempt.id,
      subscriptionId: subscription.id,
      expected: order.amountCents,
      received: params.amountCents,
    });
    await markEvent(tx, params.paymentEventId, 'rejected', order.id);
    return 'amount_mismatch';
  }

  const now = params.paidAt ?? new Date();

  await tx.paymentOrder.update({
    where: { id: order.id },
    data: {
      status: 'paid',
      paidAt: now,
      providerTransactionId: params.providerTransactionId ?? order.providerTransactionId,
    },
  });

  // A captured renewal that arrives after the subscription or attempt reached
  // a terminal/manual-review state must not silently reactivate it. Record the
  // payment, then queue an explicit completion-or-refund decision.
  if (
    subscription.status === 'expired' ||
    subscription.status === 'canceled' ||
    attempt.status === 'canceled' ||
    attempt.status === 'requires_review'
  ) {
    if (attempt.status !== 'requires_review') {
      assertRenewalAttemptTransition(
        attempt.status as 'processing' | 'awaiting_confirmation' | 'retryable_failed' | 'canceled',
        'requires_review',
      );
      await tx.renewalAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'requires_review',
          completedAt: now,
          lockedBy: null,
          lockedUntil: null,
          failureCode: 'LATE_PAYMENT_AFTER_TERMINAL_STATE',
        },
      });
    }
    billingLog('refund_queue', {
      eventType: 'late_renewal_success',
      renewalAttemptId: attempt.id,
      subscriptionId: subscription.id,
      paymentOrderId: order.id,
      provider: params.provider,
      providerTransactionId: params.providerTransactionId,
      subscriptionStatus: subscription.status,
      attemptStatus: attempt.status,
    });
    await markEvent(tx, params.paymentEventId, 'requires_review', order.id);
    return 'renewal_late_success_requires_review';
  }

  // Extend from the ORIGINAL period end so webhook latency never shortens the
  // paid term (spec §12.5).
  const newPeriodStart = attempt.periodStart;
  const newPeriodEnd = attempt.periodEnd;
  const quote = computeRenewalQuote(subscription);

  assertSubscriptionTransition(
    subscription.status as 'active' | 'past_due',
    'active',
  );
  await tx.subscription.update({
    where: { id: subscription.id },
    data: {
      status: 'active',
      currentPeriodStart: newPeriodStart,
      currentPeriodEnd: newPeriodEnd,
      nextBillingAt: newPeriodEnd,
      gracePeriodEnd: null,
      discountRemainingCycles: quote.remainingCyclesAfter,
    },
  });

  await enqueueSubscriptionPaymentNotification(tx, {
    subscriptionId: subscription.id,
    userId: subscription.userId,
    periodEnd: newPeriodEnd,
    purchaseType: 'manual_renewal',
    now,
  });

  assertRenewalAttemptTransition(
    attempt.status as 'processing' | 'awaiting_confirmation' | 'retryable_failed',
    'succeeded',
  );
  await tx.renewalAttempt.update({
    where: { id: attempt.id },
    data: { status: 'succeeded', completedAt: now, failureCode: null, failureMessage: null },
  });
  await tx.renewalAttempt.updateMany({
    where: {
      subscriptionId: subscription.id,
      periodStart: attempt.periodStart,
      id: { not: attempt.id },
      status: { in: ['scheduled', 'notifying', 'retryable_failed'] },
    },
    data: { status: 'canceled', completedAt: now },
  });

  billingMetric('billing_renewal_success_total', {
    renewalAttemptId: attempt.id,
    subscriptionId: subscription.id,
    paymentOrderId: order.id,
  });
  if (subscription.status === 'past_due') {
    billingMetric('billing_renewal_recovered_total', {
      renewalAttemptId: attempt.id,
      subscriptionId: subscription.id,
    });
  }
  billingLog('renewal_succeeded', {
    renewalAttemptId: attempt.id,
    subscriptionId: subscription.id,
    paymentOrderId: order.id,
    provider: params.provider,
    statusFrom: subscription.status,
    statusTo: 'active',
  });

  await markEvent(tx, params.paymentEventId, 'processed', order.id);
  return 'renewal_activated';
}

async function markEvent(
  tx: Tx,
  providerEventId: string,
  status: 'processed' | 'ignored' | 'rejected' | 'requires_review',
  paymentOrderId: string | null,
): Promise<void> {
  await tx.paymentEvent.update({
    where: { providerEventId },
    data: { status, paymentOrderId, processedAt: new Date() },
  }).catch(() => undefined);
}

// ─── Attempt execution ──────────────────────────────────────────────────────

/**
 * Pre-takeover channel check for attempts that already hold an order
 * (remediation §4.4.2): query the channel by order id.
 * - paid at the channel -> reconcile locally, never re-charge ('reconciled')
 * - order closed/revoked at the channel (definitively unpaid) -> 'timeout'
 *   (a NEW attempt number may retry with a fresh channel order)
 * - channel has no answer -> 'wait' (same order, next takeover round — never
 *   a new attempt number, which could double-charge)
 * - open and unpaid -> 'resubmit' (same idempotency key at the channel makes
 *   the resubmission safe)
 */
async function takeoverPrecheck(
  attempt: RenewalAttemptRecord,
  provider: BillingProvider,
  adapter: { queryPayment?: PaymentProviderAdapter['queryPayment'] },
): Promise<'reconciled' | 'timeout' | 'wait' | 'review' | 'resubmit'> {
  if (typeof adapter.queryPayment !== 'function') return 'timeout';
  const orderId = attempt.paymentOrder!.id;
  billingLog('renewal_takeover_precheck', {
    renewalAttemptId: attempt.id,
    paymentOrderId: orderId,
    provider,
  });
  try {
    const query = await adapter.queryPayment({ orderId });
    const paid =
      query.status === 'SUCCESS' || query.status === 'TRADE_SUCCESS' || query.status === 'TRADE_FINISHED';
    if (paid) {
      if (
        query.amountCents === null ||
        query.currency === null ||
        query.currency !== attempt.currency
      ) {
        const eventId = `renewal-takeover-${orderId}`;
        await prisma.$transaction(async (tx: Tx) => {
          await tx.paymentEvent.upsert({
            where: { providerEventId: eventId },
            create: {
              provider,
              providerEventId: eventId,
              eventType: 'RENEWAL_CONFIRMED_BY_ACTIVE_QUERY',
              status: 'requires_review',
              signatureVerified: true,
              payload: {
                orderId,
                amountCents: query.amountCents,
                currency: query.currency,
                issue: 'channel query returned incomplete or mismatched financial data',
              },
              paymentOrderId: orderId,
              processedAt: new Date(),
            },
            update: {},
          });
          await tx.renewalAttempt.update({
            where: { id: attempt.id },
            data: {
              status: 'requires_review',
              failureCode: 'UNVERIFIED_CHANNEL_AMOUNT',
              lockedBy: null,
              lockedUntil: null,
            },
          });
        });
        return 'review';
      }
      const outcome = await prisma
        .$transaction(async (tx: Tx) => {
          await tx.$queryRaw`SELECT * FROM "PaymentOrder" WHERE "id" = ${orderId} FOR UPDATE`;
          return reconcileRenewalPayment(tx, {
            paymentOrderId: orderId,
            provider,
            providerTransactionId: query.providerTransactionId,
            amountCents: query.amountCents,
            paidAt: query.paidAt,
            paymentEventId: `renewal-takeover-${orderId}`,
          });
        })
        .catch((error: unknown) => {
          billingLog('renewal_takeover_reconcile_failed', {
            paymentOrderId: orderId,
            renewalAttemptId: attempt.id,
            errorCode: error instanceof Error ? error.message : String(error),
          });
          return 'order_not_found' as const;
        });
      if (outcome === 'renewal_activated' || outcome === 'renewal_already_processed') return 'reconciled';
      if (outcome === 'renewal_late_success_requires_review') return 'review';
      return 'timeout';
    }
    // Not paid. A closed/expired channel order can never be paid — retry with
    // a fresh attempt number; anything else is safe to resubmit.
    if (query.status === 'CLOSED' || query.status === 'TRADE_CLOSED' || query.status === 'REVOKED') {
      return 'timeout';
    }
    if (query.status === null) {
      // Channel has no answer — WAIT for the next takeover round under the
      // same order. Retrying with a new attempt number would mint a new
      // channel idempotency key and could double-charge
      // (second-review finding 6).
      return 'wait';
    }
    return 'resubmit';
  } catch (error) {
    billingLog('renewal_takeover_precheck_failed', {
      paymentOrderId: orderId,
      renewalAttemptId: attempt.id,
      errorCode: error instanceof Error ? error.message : String(error),
    });
    // Query failure is uncertainty, not a channel verdict — wait for the next
    // takeover round under the same order (never mint a new idempotency key).
    return 'wait';
  }
}

export type RenewalExecutionOutcome =
  | 'succeeded'
  | 'pending_webhook'
  | 'retry_scheduled'
  | 'failed_non_retryable'
  | 'requires_review'
  | 'skipped';

/**
 * Execute a claimed renewal attempt: create the renewal PaymentOrder in a
 * short transaction, charge the agreement outside it, then reconcile.
 * The adapter is resolved from the subscription's provider; tests inject
 * fakes via `adapterOverride`.
 */
export type RenewalAdapterOverride = {
  chargeAgreement: (input: unknown) => Promise<ChargeAgreementResult>;
  queryPayment?: (input: { orderId: string }) => Promise<{
    status: string | null;
    providerTransactionId: string | null;
    paidAt: Date | null;
    amountCents: number | null;
    currency: string | null;
  }>;
};

export async function executeRenewalAttempt(
  attempt: RenewalAttemptRecord,
  options: { adapterOverride?: RenewalAdapterOverride } = {},
): Promise<RenewalExecutionOutcome> {
  const subscription = attempt.subscription;
  const provider = (subscription.provider ?? 'wechatpay') as BillingProvider;
  const adapter = options.adapterOverride ?? getAdapter(provider);
  const idempotencyKey = renewalIdempotencyKey(subscription.id, attempt.periodStart, attempt.attemptNumber);

  // Renewal orders require a plan reference; guard legacy rows without one.
  if (!subscription.billingPlanId) {
    return finalizeNonRetryable(attempt, 'MISSING_BILLING_PLAN', 'subscription has no billing plan');
  }

  if (typeof adapter.chargeAgreement !== 'function') {
    return finalizeNonRetryable(attempt, 'AGREEMENT_CHARGE_NOT_SUPPORTED', 'channel does not support agreement charge');
  }

  // ─── Takeover pre-check (remediation §4.4.2) ──────────────────────────────
  // This attempt already has an order — a previous worker crashed mid-flight
  // or the async charge result never arrived. Query the channel FIRST: if the
  // charge succeeded we reconcile locally; an UNKNOWN channel answer waits for
  // the next takeover round instead of retrying with a NEW attempt number —
  // a new number means a new channel idempotency key, which could double-
  // charge if the original submission later succeeds (second-review finding 6).
  if (attempt.paymentOrder) {
    const precheck = await takeoverPrecheck(attempt, provider, adapter);
    if (precheck === 'reconciled') return 'succeeded';
    if (precheck === 'review') return 'requires_review';
    if (precheck === 'timeout') {
      return finalizeRetryable(attempt, 'CHARGE_CONFIRMATION_TIMEOUT', 'charge result not confirmed before lease expiry');
    }
    if (precheck === 'wait') {
      // Channel has no answer yet — keep waiting under the SAME order/idempotency
      // key; the lease expiry re-queues the takeover query.
      await prisma.renewalAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'awaiting_confirmation',
          lockedUntil: new Date(Date.now() + LEASE_MINUTES * 60_000),
        },
      }).catch(() => undefined);
      return 'pending_webhook';
    }
    // 'resubmit' — channel answered definitively "not paid"; fall through and
    // execute normally (same idempotency key for the same attempt number).
  }

  // Short tx: create the renewal order linked to the attempt.
  let orderId: string;
  try {
    orderId = await prisma.$transaction(async (tx: Tx) => {
      await tx.$queryRaw`SELECT * FROM "RenewalAttempt" WHERE "id" = ${attempt.id} FOR UPDATE`;
      const fresh = await tx.renewalAttempt.findUnique({
        where: { id: attempt.id },
        include: { paymentOrder: true },
      });
      if (!fresh) throw new Error('attempt vanished');
      if (fresh.paymentOrder) return fresh.paymentOrder.id;

      const created = await tx.paymentOrder.create({
        data: {
          userId: subscription.userId,
          workspaceId: subscription.workspaceId,
          billingPlanId: subscription.billingPlanId!,
          module: subscription.module,
          billingCycle: subscription.billingCycle,
          provider,
          status: 'pending',
          amountCents: fresh.amountCents,
          currency: fresh.currency,
          orderType: 'renewal',
          attemptNumber: fresh.attemptNumber,
          idempotencyKey,
          metadata: { renewalAttemptId: fresh.id },
        },
      });
      await tx.renewalAttempt.update({
        where: { id: fresh.id },
        data: { paymentOrderId: created.id },
      });
      return created.id;
    });
  } catch (error) {
    billingLog('renewal_order_create_failed', {
      renewalAttemptId: attempt.id,
      errorCode: (error as Error).message,
    });
    return 'skipped';
  }

  billingLog('renewal_charge_started', {
    renewalAttemptId: attempt.id,
    paymentOrderId: orderId,
    provider,
  });

  const agreement = subscription.paymentAgreementId
    ? await prisma.paymentAgreement.findUnique({
        where: { id: subscription.paymentAgreementId },
      })
    : null;

  let result: ChargeAgreementResult;
  try {
    result = await adapter.chargeAgreement({
      providerAgreementId: agreement?.providerAgreementId ?? '',
      orderId,
      amountCents: attempt.amountCents,
      currency: attempt.currency,
      description: `订阅续费 ${subscription.billingCycle === 'yearly' ? '年付' : '月付'}`,
      idempotencyKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Adapter-level throw = infrastructure issue -> retryable.
    return finalizeRetryable(attempt, 'CHARGE_ERROR', message);
  }

  if (result.outcome === 'succeeded') {
    const outcome = await prisma
      .$transaction(async (tx: Tx) => {
        await tx.$queryRaw`SELECT * FROM "PaymentOrder" WHERE "id" = ${orderId} FOR UPDATE`;
        return reconcileRenewalPayment(tx, {
          paymentOrderId: orderId,
          provider,
          providerTransactionId: result.providerTransactionId ?? null,
          amountCents: attempt.amountCents,
          paidAt: new Date(),
          paymentEventId: `renewal-sync-${orderId}`,
        });
      })
      .catch((error: unknown) => {
        billingLog('renewal_sync_reconcile_failed', {
          paymentOrderId: orderId,
          renewalAttemptId: attempt.id,
          errorCode: (error as Error).message,
        });
        return 'order_not_found' as const;
      });
    return outcome === 'renewal_activated' ? 'succeeded' : 'skipped';
  }

  if (result.outcome === 'pending') {
    // Async result arrives via provider webhook. The attempt waits in
    // awaiting_confirmation; the lease expiring lets the watchdog re-claim
    // and actively query the channel (remediation §4.4).
    await prisma.paymentOrder.update({
      where: { id: orderId },
      data: { status: 'processing' },
    });
    await prisma.renewalAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'awaiting_confirmation',
        lockedUntil: new Date(Date.now() + LEASE_MINUTES * 60_000),
      },
    });
    return 'pending_webhook';
  }

  if (result.retryable) {
    return finalizeRetryable(attempt, result.failureCode ?? 'CHARGE_FAILED', result.failureMessage ?? '');
  }
  return finalizeNonRetryable(attempt, result.failureCode ?? 'CHARGE_FAILED', result.failureMessage ?? '');
}

async function finalizeRetryable(
  attempt: RenewalAttemptRecord,
  code: string,
  message: string,
): Promise<RenewalExecutionOutcome> {
  const now = new Date();
  const subscription = attempt.subscription;
  const retryAt = nextRetryAt(attempt.periodStart, attempt.attemptNumber);

  // No retry window left (past the D3 retry, attempt cap reached): park the
  // attempt for manual handling instead of scheduling an impossible retry
  // (remediation §4.4.5 — stuck tasks must converge to a terminal state).
  if (!retryAt || attempt.attemptNumber >= RENEWAL_MAX_ATTEMPTS) {
    await prisma.renewalAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'requires_review',
        failureCode: code,
        failureMessage: message.slice(0, 500),
        lockedBy: null,
        lockedUntil: null,
        completedAt: now,
      },
    }).catch(() => undefined);
    billingMetric('billing_renewal_failure_total', {
      renewalAttemptId: attempt.id,
      subscriptionId: subscription.id,
      errorCode: code,
      requiresReview: true,
    });
    return 'failed_non_retryable';
  }

  await prisma.$transaction(async (tx: Tx) => {
    assertRenewalAttemptTransition('processing', 'retryable_failed');
    await tx.renewalAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'retryable_failed',
        failureCode: code,
        failureMessage: message.slice(0, 500),
        nextRetryAt: retryAt,
        lockedBy: null,
        lockedUntil: null,
      },
    });

    // First failure moves the subscription into past_due with a grace window
    // (spec §12.4); entitlement is retained during grace.
    if (subscription.status === 'active') {
      assertSubscriptionTransition('active', 'past_due');
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'past_due',
          gracePeriodEnd: addGracePeriod(attempt.periodStart),
        },
      });
    }
  });

  billingMetric('billing_renewal_failure_total', {
    renewalAttemptId: attempt.id,
    subscriptionId: subscription.id,
    errorCode: code,
    retryable: true,
    nextRetryAt: retryAt?.toISOString() ?? null,
  });
  billingLog('renewal_attempt_failed', {
    renewalAttemptId: attempt.id,
    subscriptionId: subscription.id,
    errorCode: code,
    statusFrom: 'processing',
    statusTo: 'retryable_failed',
  });
  return 'retry_scheduled';
}

async function finalizeNonRetryable(
  attempt: RenewalAttemptRecord,
  code: string,
  message: string,
): Promise<'failed_non_retryable'> {
  const subscription = attempt.subscription;

  await prisma.$transaction(async (tx: Tx) => {
    assertRenewalAttemptTransition('processing', 'failed');
    await tx.renewalAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'failed',
        failureCode: code,
        failureMessage: message.slice(0, 500),
        completedAt: new Date(),
        lockedBy: null,
        lockedUntil: null,
      },
    });

    // Non-retryable (e.g. agreement revoked): stop all future charges
    // immediately (spec §12.4).
    await tx.renewalAttempt.updateMany({
      where: { subscriptionId: subscription.id, status: { in: ['scheduled', 'notifying'] } },
      data: { status: 'canceled' },
    });
    await tx.subscription.update({
      where: { id: subscription.id },
      data: { autoRenew: false },
    });
    if (subscription.paymentAgreementId) {
      await tx.paymentAgreement.update({
        where: { id: subscription.paymentAgreementId },
        data: { status: 'revoked', revokedAt: new Date() },
      }).catch(() => undefined);
    }
  });

  billingMetric('billing_renewal_failure_total', {
    renewalAttemptId: attempt.id,
    subscriptionId: subscription.id,
    errorCode: code,
    retryable: false,
  });
  billingLog('renewal_attempt_failed', {
    renewalAttemptId: attempt.id,
    subscriptionId: subscription.id,
    errorCode: code,
    statusFrom: 'processing',
    statusTo: 'failed',
  });
  return 'failed_non_retryable';
}

// ─── Grace expiry (spec §12.4 final row) ────────────────────────────────────

export async function expireGracePeriods(now: Date): Promise<number> {
  const overdue = await prisma.subscription.findMany({
    where: { status: 'past_due', gracePeriodEnd: { lt: now } },
    select: { id: true },
  });
  if (overdue.length === 0) return 0;
  const ids = overdue.map((row) => row.id);

  await prisma.$transaction(async (tx: Tx) => {
    await tx.subscription.updateMany({
      where: { id: { in: ids }, status: 'past_due' },
      data: { status: 'expired', autoRenew: false, nextBillingAt: null },
    });
    await tx.renewalAttempt.updateMany({
      where: { subscriptionId: { in: ids }, status: { in: ['scheduled', 'notifying', 'retryable_failed'] } },
      data: { status: 'canceled' },
    });
    // In-flight attempts remain claimable. The watchdog keeps querying the
    // original channel order; a later paid result is recorded and routed to
    // manual completion/refund without reactivating the expired subscription.
  });

  billingLog('renewal_grace_expired', { count: ids.length, subscriptionIds: ids });
  return ids.length;
}

// ─── Batch entry point (cron) ───────────────────────────────────────────────

export type RenewalRunResult = {
  expiredSessions: number;
  expiredGrace: number;
  attemptsCreated: number;
  claimed: number;
  results: Array<{ renewalAttemptId: string; outcome: RenewalExecutionOutcome }>;
};

export async function runRenewalBatch(workerId: string, batchSize = 50): Promise<RenewalRunResult> {
  const now = new Date();
  const expiredSessions = await expireStaleSessions().catch(() => 0);
  const expiredGrace = await expireGracePeriods(now);
  const attemptsCreated = await ensureRenewalAttempts(now);
  const claimed = await claimRenewalAttempts(workerId, batchSize);

  const results: RenewalRunResult['results'] = [];
  for (const attempt of claimed) {
    try {
      const outcome = await executeRenewalAttempt(attempt);
      results.push({ renewalAttemptId: attempt.id, outcome });
    } catch (error) {
      // An execution crash must NOT leave the attempt stuck in 'processing'
      // until manual surgery (remediation §4.4.5): route it into the retry
      // path, or the review queue when no retry window remains.
      const message = error instanceof Error ? error.message : String(error);
      billingLog('renewal_execution_error', {
        renewalAttemptId: attempt.id,
        errorCode: message,
      });
      const outcome = await finalizeRetryable(attempt, 'EXECUTION_ERROR', message).catch(() =>
        'skipped' as const,
      );
      results.push({ renewalAttemptId: attempt.id, outcome });
    }
  }

  return { expiredSessions, expiredGrace, attemptsCreated, claimed: claimed.length, results };
}

// ─── Turn off auto-renew (spec §8.6) ────────────────────────────────────────

export type AutoRenewOffResult = {
  status: 'closed' | 'revoking';
};

export async function disableAutoRenew(params: {
  subscriptionId: string;
  userId: string;
  workspaceId: string;
}): Promise<AutoRenewOffResult> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      id: params.subscriptionId,
      userId: params.userId,
      workspaceId: params.workspaceId,
    },
    include: { paymentAgreement: true },
  });
  if (!subscription) {
    throw toBillingError('NOT_FOUND');
  }

  // Best-effort channel revocation FIRST; a provider failure must not block
  // the local state change, but means we keep retrying (spec §8.6 -> 202).
  let providerRevoked = true;
  if (subscription.paymentAgreement?.providerAgreementId) {
    try {
      const adapter = getAdapter(subscription.paymentAgreement.provider as BillingProvider);
      if (adapter.revokeAgreement) {
        await adapter.revokeAgreement({
          providerAgreementId: subscription.paymentAgreement.providerAgreementId,
        });
      }
    } catch {
      providerRevoked = false;
    }
  }

  await prisma.$transaction(async (tx: Tx) => {
    await tx.$queryRaw`SELECT * FROM "Subscription" WHERE "id" = ${subscription.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT * FROM "PaymentAgreement" WHERE "id" = ${subscription.paymentAgreementId ?? ''} FOR UPDATE`;

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        autoRenew: false,
        cancelAtPeriodEnd: true,
      },
    });

    if (subscription.paymentAgreementId) {
      // remediation §4.2: 'revoking' = channel revoke still in flight — do
      // NOT reuse 'pending' (that means awaiting sign-up); a watchdog retries.
      await tx.paymentAgreement.update({
        where: { id: subscription.paymentAgreementId },
        data: {
          status: providerRevoked ? 'revoked' : 'revoking',
          revokedAt: providerRevoked ? new Date() : null,
        },
      });
    }

    // Cancel not-yet-executed renewal attempts (spec §8.6 step 6).
    await tx.renewalAttempt.updateMany({
      where: {
        subscriptionId: subscription.id,
        status: { in: ['scheduled', 'notifying'] },
      },
      data: { status: 'canceled' },
    });
  });

  billingLog('auto_renew_disabled', {
    subscriptionId: subscription.id,
    providerRevoked,
  });

  return { status: providerRevoked ? 'closed' : 'revoking' };
}
