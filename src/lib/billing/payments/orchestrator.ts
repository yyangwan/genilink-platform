// Payment orchestrator (spec §10.2): creates per-attempt PaymentOrders under a
// CheckoutSession, always re-validating the server-side quote. Provider network
// calls happen strictly AFTER the transaction commits.

import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { billingLog, billingMetric } from '@/lib/billing/log';
import { BillingError, toBillingError, type PurchaseType } from '@/lib/billing/types';
import { assertCheckoutSessionTransition, assertPaymentOrderTransition } from '@/lib/billing/state-machines';
import { requestHash } from '@/lib/billing/idempotency';
import { calculateCheckoutQuote } from '@/lib/billing/checkout/quote';
import {
  loadOwnedCheckoutSession,
  SESSION_INCLUDE,
  type CheckoutSessionRecord,
} from '@/lib/billing/checkout/service';
import { promotionRuleInput, reserveRedemption } from '@/lib/billing/promotions/service';
import { getAdapter } from '@/lib/billing/payments/provider';
import type { BillingProvider } from '@/types/billing';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const OPEN_ORDER_STATUSES = ['pending', 'opened', 'processing'] as const;

export type ConfirmPaymentResult = {
  checkoutSession: { id: string; status: string };
  payment: {
    id: string;
    provider: string;
    status: string;
    presentation: 'qr_code' | 'redirect' | null;
    codeUrl: string | null;
    redirectUrl: string | null;
    expiresAt: string | null;
    attemptNumber: number;
    failureCode: string | null;
    failureMessage: string | null;
  };
};

export async function createPaymentAttempt(params: {
  sessionId: string;
  userId: string;
  workspaceId: string;
  provider: BillingProvider;
  autoRenew: boolean;
  agreementAcceptedVersion?: string | null;
  idempotencyKey?: string | null;
  forceNewAttempt?: boolean;
  requestIp?: string | null;
  requestUa?: string | null;
  requestOrigin?: string | null;
}): Promise<ConfirmPaymentResult> {
  const now = new Date();
  const session = await loadOwnedCheckoutSession({
    sessionId: params.sessionId,
    userId: params.userId,
    workspaceId: params.workspaceId,
  });
  if (!session) throw toBillingError('NOT_FOUND');

  if (session.expiresAt <= now) {
    throw toBillingError('CHECKOUT_SESSION_EXPIRED');
  }
  if (session.status !== 'ready' && session.status !== 'processing') {
    throw toBillingError('CHECKOUT_SESSION_NOT_CONFIRMABLE', { status: session.status });
  }

  // An open attempt means a payment is already in flight — return it instead
  // of double-charging. An explicit "refresh QR code" passes forceNewAttempt
  // to close the old attempt and open attemptNumber + 1 (spec §10.2).
  const openAttempt = session.paymentOrders.find((order) =>
    (OPEN_ORDER_STATUSES as readonly string[]).includes(order.status),
  );
  if (openAttempt && !params.forceNewAttempt) {
    return serializeConfirmResult(session.id, openAttempt);
  }

  const adapter = getAdapter(params.provider);
  const capabilities = adapter.getCapabilities();

  if (!capabilities.oneTimePayment) {
    throw toBillingError('PAYMENT_PROVIDER_NOT_CONFIGURED', { provider: params.provider });
  }
  if (params.autoRenew) {
    if (!capabilities.recurringPayment) {
      throw toBillingError('AUTO_RENEW_NOT_SUPPORTED', { provider: params.provider });
    }
    if (!params.agreementAcceptedVersion) {
      throw toBillingError('AGREEMENT_VERSION_REQUIRED');
    }
  }

  // Recompute the quote server-side; it must match the frozen snapshot.
  const coupon = session.coupon
    ? await prisma.coupon.findUnique({ where: { id: session.couponId! }, include: { promotion: true } })
    : null;
  const quote = calculateCheckoutQuote({
    plan: {
      key: session.billingPlan.key,
      name: session.billingPlan.name,
      billingCycle: session.billingPlan.billingCycle,
      module: session.billingPlan.module,
      priceCents: session.billingPlan.priceCents,
      currency: session.billingPlan.currency,
    },
    promotion: coupon ? promotionRuleInput(coupon.promotion) : null,
    coupon: coupon ? { code: coupon.code } : null,
    purchaseType: session.purchaseType as PurchaseType,
    now,
  });
  if (
    quote.subtotalCents !== session.subtotalCents ||
    quote.amountDueCents !== session.amountDueCents
  ) {
    throw toBillingError('QUOTE_MISMATCH', {
      stored: { subtotalCents: session.subtotalCents, amountDueCents: session.amountDueCents },
      recomputed: { subtotalCents: quote.subtotalCents, amountDueCents: quote.amountDueCents },
    });
  }

  // Confirm idempotency: replay the stored attempt for the same key + body.
  const confirmKey = params.idempotencyKey
    ? `confirm:${session.id}:${params.idempotencyKey}`
    : null;
  if (confirmKey) {
    const existingOrder = await prisma.paymentOrder.findUnique({
      where: { idempotencyKey: confirmKey },
    });
    if (existingOrder) {
      const bodyHash = requestHash({
        provider: params.provider,
        autoRenew: params.autoRenew,
        agreementAcceptedVersion: params.agreementAcceptedVersion ?? null,
      });
      if (existingOrder.idempotencyRequestHash === bodyHash) {
        return serializeConfirmResult(session.id, existingOrder);
      }
      throw toBillingError('IDEMPOTENCY_KEY_REUSED');
    }
  }

  // Attempt being replaced (QR refresh): the open attempt gets closed locally
  // and at the channel, then attemptNumber + 1 is created.
  const supersededAttempt =
    params.forceNewAttempt && openAttempt
      ? openAttempt
      : session.paymentOrders.find(
          (order) => order.status === 'opened' || order.status === 'pending',
        );

  // ─── Transaction: lock session, reserve coupon, create attempt ────────────
  const order = await prisma.$transaction(
    async (tx: Tx) => {
      // Serialize concurrent confirms on the same session.
      await tx.$queryRaw`SELECT * FROM "CheckoutSession" WHERE "id" = ${session.id} FOR UPDATE`;

      const fresh = await tx.checkoutSession.findUnique({
        where: { id: session.id },
        include: SESSION_INCLUDE,
      });
      if (!fresh) throw toBillingError('NOT_FOUND');
      if (fresh.status === 'completed' || fresh.status === 'expired' || fresh.status === 'canceled' || fresh.status === 'failed') {
        throw toBillingError('CHECKOUT_SESSION_NOT_CONFIRMABLE', { status: fresh.status });
      }

      const concurrentOpen = fresh.paymentOrders.find((o) =>
        (OPEN_ORDER_STATUSES as readonly string[]).includes(o.status),
      );
      if (concurrentOpen && !params.forceNewAttempt) {
        return { reused: true as const, order: concurrentOpen };
      }

      // Re-validate & reserve coupon quota under lock (spec §7.5).
      if (fresh.couponId) {
        const reservation = await reserveRedemption(tx, {
          checkoutSession: {
            id: fresh.id,
            userId: fresh.userId,
            workspaceId: fresh.workspaceId,
            billingPlanId: fresh.billingPlanId,
            couponId: fresh.couponId,
          },
          plan: {
            key: fresh.billingPlan.key,
            name: fresh.billingPlan.name,
            billingCycle: fresh.billingPlan.billingCycle,
            module: fresh.billingPlan.module,
            priceCents: fresh.billingPlan.priceCents,
            currency: fresh.billingPlan.currency,
          },
          purchaseType: fresh.purchaseType as PurchaseType,
          now,
        });
        if (!reservation.ok) {
          throw toBillingError(reservation.code);
        }
      }

      const nextAttemptNumber =
        fresh.paymentOrders.reduce((max, o) => Math.max(max, o.attemptNumber), 0) + 1;

      // Close the superseded attempt (QR refresh path, spec §10.2). The channel
      // close call happens after commit; the local cancel is authoritative.
      if (concurrentOpen && params.forceNewAttempt) {
        assertPaymentOrderTransition(
          concurrentOpen.status as 'pending' | 'opened' | 'processing',
          'canceled',
        );
        await tx.paymentOrder.update({
          where: { id: concurrentOpen.id },
          data: { status: 'canceled', closedAt: now },
        });
      }

      if (params.autoRenew) {
        // One agreement per session (checkoutSessionId unique).
        await tx.paymentAgreement.upsert({
          where: { checkoutSessionId: fresh.id },
          create: {
            userId: fresh.userId,
            workspaceId: fresh.workspaceId,
            checkoutSessionId: fresh.id,
            provider: params.provider,
            status: 'pending',
            agreementVersion: params.agreementAcceptedVersion!,
            providerTemplateId: null,
          },
          update: {
            provider: params.provider,
            agreementVersion: params.agreementAcceptedVersion!,
          },
        });
      }

      if (fresh.status === 'ready') {
        assertCheckoutSessionTransition('ready', 'processing');
      }
      await tx.checkoutSession.update({
        where: { id: fresh.id },
        data: {
          status: 'processing',
          autoRenew: params.autoRenew,
          agreementAcceptedVersion: params.autoRenew ? params.agreementAcceptedVersion ?? null : null,
          agreementAcceptedAt: params.autoRenew ? now : null,
          agreementAcceptedIp: params.autoRenew ? params.requestIp ?? null : null,
          agreementAcceptedUa: params.autoRenew ? params.requestUa ?? null : null,
        },
      });

      const created = await tx.paymentOrder.create({
        data: {
          userId: fresh.userId,
          workspaceId: fresh.workspaceId,
          billingPlanId: fresh.billingPlanId,
          module: fresh.billingPlan.module,
          billingCycle: fresh.billingPlan.billingCycle,
          provider: params.provider,
          status: 'pending',
          amountCents: fresh.amountDueCents,
          currency: fresh.currency,
          checkoutSessionId: fresh.id,
          orderType: 'initial',
          attemptNumber: nextAttemptNumber,
          idempotencyKey: confirmKey,
          idempotencyRequestHash: requestHash({
            provider: params.provider,
            autoRenew: params.autoRenew,
            agreementAcceptedVersion: params.agreementAcceptedVersion ?? null,
          }),
          metadata: {},
        },
      });

      return { reused: false as const, order: created };
    },
    { timeout: 15_000 },
  );

  if (order.reused) {
    return serializeConfirmResult(session.id, order.order);
  }

  // ─── After commit: channel call, then mark opened/failed ──────────────────
  if (supersededAttempt) {
    try {
      await adapter.closePayment({ orderId: supersededAttempt.id });
    } catch (error) {
      billingLog('payment_close_failed', {
        paymentOrderId: supersededAttempt.id,
        provider: params.provider,
        errorCode: (error as Error).message,
      });
    }
  }


  try {
    const created = await adapter.createOneTimePayment({
      orderId: order.order.id,
      amountCents: order.order.amountCents,
      currency: order.order.currency,
      description: session.billingPlan.name,
      idempotencyKey: order.order.idempotencyKey ?? order.order.id,
      requestOrigin: params.requestOrigin ?? undefined,
    });

    const expiresAt = session.expiresAt;
    const updatedOrder = await prisma.paymentOrder.update({
      where: { id: order.order.id },
      data: {
        status: 'opened',
        providerSessionId: created.providerSessionId,
        expiredAt: expiresAt,
        metadata: {
          presentation: created.presentation,
          codeUrl: created.codeUrl ?? null,
          redirectUrl: created.redirectUrl ?? null,
          providerPayload: (created.providerPayload ?? null) as Prisma.InputJsonValue,
        },
      },
    });

    billingLog('payment_opened', {
      checkoutSessionId: session.id,
      paymentOrderId: updatedOrder.id,
      provider: params.provider,
      statusFrom: 'pending',
      statusTo: 'opened',
    });

    return serializeConfirmResult(session.id, updatedOrder);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.paymentOrder.update({
      where: { id: order.order.id },
      data: {
        status: 'failed',
        failureCode: 'PROVIDER_CREATE_FAILED',
        failureMessage: message.slice(0, 500),
        closedAt: new Date(),
      },
    });
    // Payment failure returns the session to ready so the user can switch
    // channels on the SAME session (spec §13.1 processing -> ready).
    await prisma.checkoutSession.updateMany({
      where: { id: session.id, status: 'processing' },
      data: { status: 'ready' },
    });
    billingMetric('billing_payment_failure_total', {
      checkoutSessionId: session.id,
      paymentOrderId: order.order.id,
      provider: params.provider,
      errorCode: 'PROVIDER_CREATE_FAILED',
    });
    throw new BillingError(
      'PAYMENT_PROVIDER_NOT_CONFIGURED',
      `支付渠道下单失败: ${message.slice(0, 200)}`,
      502,
      { provider: params.provider },
    );
  }
}

export function serializeConfirmResult(
  sessionId: string,
  order: {
    id: string;
    provider: string;
    status: string;
    attemptNumber: number;
    expiredAt: Date | null;
    failureCode: string | null;
    failureMessage: string | null;
    metadata: unknown;
  },
): ConfirmPaymentResult {
  const metadata = (order.metadata ?? {}) as {
    presentation?: string;
    codeUrl?: string;
    redirectUrl?: string;
  };
  return {
    checkoutSession: { id: sessionId, status: 'processing' },
    payment: {
      id: order.id,
      provider: order.provider,
      status: order.status,
      presentation: (metadata.presentation as 'qr_code' | 'redirect') ?? null,
      codeUrl: metadata.codeUrl ?? null,
      redirectUrl: metadata.redirectUrl ?? null,
      expiresAt: order.expiredAt ? order.expiredAt.toISOString() : null,
      attemptNumber: order.attemptNumber,
      failureCode: order.failureCode ?? null,
      failureMessage: order.failureMessage ?? null,
    },
  };
}
