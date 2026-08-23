// Payment reconciliation (spec §11). Legacy path kept for orders without a
// CheckoutSession; the new transactional path covers checkout orders and
// delegates renewal orders to the renewals service.

import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import type { BillingProvider } from '@/types/billing';
import { billingLog, billingMetric } from '@/lib/billing/log';
import {
  assertCheckoutSessionTransition,
  assertPaymentOrderTransition,
} from '@/lib/billing/state-machines';
import { addBillingCycle } from '@/lib/billing/periods';
import { computePeriods } from '@/lib/billing/checkout/service';
import { reconcileRenewalPayment } from '@/lib/billing/renewals/service';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

function addPeriodEnd(start: Date, billingCycle: string): Date {
  const result = new Date(start);
  if (billingCycle === 'yearly') {
    result.setFullYear(result.getFullYear() + 1);
  } else {
    result.setMonth(result.getMonth() + 1);
  }
  return result;
}

// ─── Legacy path (orders without checkout session) ──────────────────────────

export async function activateSubscriptionFromPayment(params: {
  orderId: string;
  provider: BillingProvider;
  providerSessionId?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  providerStatus?: string | null;
  paidAt?: Date | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  trialEnd?: Date | null;
}) {
  const order = await prisma.paymentOrder.findUnique({
    where: { id: params.orderId },
    include: { billingPlan: true },
  });

  if (!order) {
    return null;
  }

  const currentPeriodStart = params.periodStart ?? order.createdAt;
  const currentPeriodEnd = params.periodEnd ?? addPeriodEnd(currentPeriodStart, order.billingCycle);
  const status = params.providerStatus && params.providerStatus !== 'SUCCESS' && params.providerStatus !== 'TRADE_SUCCESS' && params.providerStatus !== 'TRADE_FINISHED'
    ? params.providerStatus
    : 'active';

  const updatedSubscription = await prisma.subscription.upsert({
    where: {
      userId_workspaceId_module: {
        userId: order.userId,
        workspaceId: order.workspaceId,
        module: order.module,
      },
    },
    create: {
      userId: order.userId,
      workspaceId: order.workspaceId,
      module: order.module,
      status,
      billingCycle: order.billingCycle,
      billingPlanId: order.billingPlanId,
      provider: params.provider,
      providerCustomerId: params.providerCustomerId ?? null,
      providerSubscriptionId: params.providerSubscriptionId ?? params.providerSessionId ?? null,
      paymentOrderId: order.id,
      currentPeriodStart,
      currentPeriodEnd,
      trialEnd: params.trialEnd ?? null,
    },
    update: {
      status,
      billingCycle: order.billingCycle,
      billingPlanId: order.billingPlanId,
      provider: params.provider,
      providerCustomerId: params.providerCustomerId ?? null,
      providerSubscriptionId: params.providerSubscriptionId ?? params.providerSessionId ?? null,
      paymentOrderId: order.id,
      currentPeriodStart,
      currentPeriodEnd,
      trialEnd: params.trialEnd ?? null,
    },
  });

  const updatedOrder = await prisma.paymentOrder.update({
    where: { id: order.id },
    data: {
      providerSessionId: params.providerSessionId ?? order.providerSessionId,
      providerCustomerId: params.providerCustomerId ?? order.providerCustomerId,
      providerSubscriptionId: params.providerSubscriptionId ?? order.providerSubscriptionId ?? params.providerSessionId ?? null,
      status: 'paid',
      paidAt: params.paidAt ?? order.paidAt ?? new Date(),
    },
  });

  return { order: updatedOrder, subscription: updatedSubscription };
}

// ─── New transactional path (spec §11.2 steps 1-12) ─────────────────────────

export type ReconcileOutcome =
  | 'activated'
  | 'already_paid'
  | 'amount_mismatch'
  | 'duplicate_success_anomaly'
  | 'late_success_requires_review'
  | 'order_not_found'
  | 'renewal_activated'
  | 'renewal_already_processed';

export async function reconcileCheckoutPayment(params: {
  paymentEventId: string;
  paymentOrderId: string;
  provider: BillingProvider;
  providerTransactionId: string | null;
  amountCents: number | null;
  paidAt: Date | null;
}): Promise<ReconcileOutcome> {
  return prisma.$transaction(
    async (tx: Tx) => {
      // 1. Lock the payment order.
      await tx.$queryRaw`SELECT * FROM "PaymentOrder" WHERE "id" = ${params.paymentOrderId} FOR UPDATE`;
      const order = await tx.paymentOrder.findUnique({
        where: { id: params.paymentOrderId },
        include: {
          checkoutSession: {
            include: { billingPlan: true, paymentAgreement: true, redemption: true },
          },
        },
      });

      if (!order) {
        await markEvent(tx, params.paymentEventId, 'ignored', null);
        return 'order_not_found';
      }

      // Renewal orders follow their own reconciliation (spec §12.5).
      if (order.orderType === 'renewal') {
        const renewalOutcome = await reconcileRenewalPayment(tx, {
          paymentOrderId: order.id,
          provider: params.provider,
          providerTransactionId: params.providerTransactionId,
          amountCents: params.amountCents,
          paidAt: params.paidAt,
          paymentEventId: params.paymentEventId,
        });
        return renewalOutcome;
      }

      if (!order.checkoutSession) {
        // Defensive: checkout orders must have a session. Fall back to legacy.
        await markEvent(tx, params.paymentEventId, 'ignored', order.id);
        return 'order_not_found';
      }

      // 2. Already paid -> idempotent success, no re-activation.
      if (order.status === 'paid') {
        await markEvent(tx, params.paymentEventId, 'processed', order.id);
        return 'already_paid';
      }

      // 3. Lock the checkout session.
      await tx.$queryRaw`SELECT * FROM "CheckoutSession" WHERE "id" = ${order.checkoutSessionId} FOR UPDATE`;
      const session = await tx.checkoutSession.findUnique({
        where: { id: order.checkoutSessionId! },
        include: { billingPlan: true, paymentAgreement: true, redemption: true },
      });
      if (!session) {
        await markEvent(tx, params.paymentEventId, 'ignored', order.id);
        return 'order_not_found';
      }

      // 4. Another attempt already succeeded -> anomaly, do not double-activate
      //    (spec §11.2 step 4: refund manual queue — logged in v1).
      if (session.status === 'completed') {
        billingLog('refund_queue', {
          eventType: 'duplicate_success_payment',
          checkoutSessionId: session.id,
          paymentOrderId: order.id,
          provider: params.provider,
          providerTransactionId: params.providerTransactionId,
          amountCents: params.amountCents,
          reason: 'second paid attempt for completed checkout session',
        });
        billingMetric('billing_payment_success_total', {
          checkoutSessionId: session.id,
          anomaly: 'duplicate_success',
        });
        await markEvent(tx, params.paymentEventId, 'processed', order.id);
        return 'duplicate_success_anomaly';
      }

      const now = params.paidAt ?? new Date();

      // 5. Verify the paid amount matches the frozen quote (spec §11.2 step 5).
      // A missing amount on a success event is a rejection, not a pass
      // (remediation §4.9 — the route normally guarantees it is non-null).
      if (params.amountCents === null || params.amountCents !== session.amountDueCents) {
        billingLog('alert', {
          eventType: 'payment_amount_mismatch',
          checkoutSessionId: session.id,
          paymentOrderId: order.id,
          provider: params.provider,
          expected: session.amountDueCents,
          received: params.amountCents,
        });
        await tx.paymentOrder.update({
          where: { id: order.id },
          data: {
            failureCode: 'AMOUNT_MISMATCH',
            failureMessage: `expected ${session.amountDueCents} got ${params.amountCents ?? 'null'}`,
          },
        });
        await markEvent(tx, params.paymentEventId, 'rejected', order.id);
        return 'amount_mismatch';
      }

      // 4b. Late success after local expiry: the channel captured the money
      // after we expired the session. Park it for manual completion or refund
      // instead of failing the transition expired -> completed (remediation §4.1).
      if (session.status === 'expired' || session.status === 'canceled' || session.status === 'failed') {
        if (order.status === 'pending') {
          assertPaymentOrderTransition('pending', 'opened');
          await tx.paymentOrder.update({ where: { id: order.id }, data: { status: 'opened' } });
        }
        assertPaymentOrderTransition(order.status as 'opened' | 'processing', 'paid');
        await tx.paymentOrder.update({
          where: { id: order.id },
          data: {
            status: 'paid',
            paidAt: now,
            providerTransactionId: params.providerTransactionId ?? order.providerTransactionId,
          },
        });
        assertCheckoutSessionTransition(session.status, 'requires_review');
        await tx.checkoutSession.update({
          where: { id: session.id },
          data: { status: 'requires_review' },
        });
        if (session.redemption && session.redemption.status === 'reserved') {
          await tx.couponRedemption.update({
            where: { id: session.redemption.id },
            data: { status: 'redeemed', redeemedAt: now },
          });
        }
        billingLog('refund_queue', {
          eventType: 'late_success_requires_review',
          checkoutSessionId: session.id,
          paymentOrderId: order.id,
          provider: params.provider,
          providerTransactionId: params.providerTransactionId,
          amountCents: params.amountCents,
          sessionStatus: session.status,
          reason: 'paid after local session expiry — manual completion or refund required',
        });
        await markEvent(tx, params.paymentEventId, 'requires_review', order.id);
        return 'late_success_requires_review';
      }

      // 6. Order -> paid (defensively pass through opened if still pending).
      if (order.status === 'pending') {
        assertPaymentOrderTransition('pending', 'opened');
        await tx.paymentOrder.update({ where: { id: order.id }, data: { status: 'opened' } });
      }
      assertPaymentOrderTransition('opened', 'paid');
      await tx.paymentOrder.update({
        where: { id: order.id },
        data: {
          status: 'paid',
          paidAt: now,
          providerTransactionId: params.providerTransactionId ?? order.providerTransactionId,
        },
      });

      // 7. Session -> completed.
      assertCheckoutSessionTransition(session.status as 'ready' | 'processing', 'completed');
      await tx.checkoutSession.update({
        where: { id: session.id },
        data: { status: 'completed', completedAt: now },
      });

      // 8. Coupon redemption reserved -> redeemed.
      if (session.redemption && session.redemption.status === 'reserved') {
        await tx.couponRedemption.update({
          where: { id: session.redemption.id },
          data: { status: 'redeemed', redeemedAt: now },
        });
      }

      // 9. Create / extend the subscription per purchase type (spec §11.2).
      const purchaseType = session.purchaseType as 'new' | 'upgrade' | 'manual_renewal';
      const existing = await tx.subscription.findUnique({
        where: {
          userId_workspaceId_module: {
            userId: session.userId,
            workspaceId: session.workspaceId,
            module: session.billingPlan.module,
          },
        },
      });

      // Agreement only activates auto-renew when actually active (v1: stays
      // pending because channel sign-off isn't implemented — spec §12.1).
      const agreementActive = session.paymentAgreement?.status === 'active';
      const autoRenew = agreementActive;

      const periods = computePeriods({
        purchaseType,
        paidAt: now,
        billingCycle: session.billingPlan.billingCycle,
        existingCurrentPeriodEnd: existing?.currentPeriodEnd ?? null,
      });

      const discountSnapshot = session.discountSnapshot as unknown as {
        duration?: string;
        durationCycles?: number | null;
      } | null;
      const repeating =
        discountSnapshot?.duration === 'repeating' &&
        (discountSnapshot.durationCycles ?? 1) > 1;

      const subscriptionData = {
        status: 'active',
        billingCycle: session.billingPlan.billingCycle,
        billingPlanId: session.billingPlanId,
        provider: params.provider,
        paymentOrderId: order.id,
        paymentAgreementId: agreementActive ? session.paymentAgreement!.id : null,
        autoRenew,
        cancelAtPeriodEnd: false,
        currentPeriodStart: periods.currentPeriodStart,
        currentPeriodEnd: periods.currentPeriodEnd,
        nextBillingAt: autoRenew ? periods.currentPeriodEnd : null,
        gracePeriodEnd: null,
        // The renewal BASE must be the undiscounted standard price
        // (remediation §4.5): renewalAmountCents is the discounted display
        // price under a repeating promotion — storing it as the base and then
        // subtracting the snapshot discount again double-discounted renewals.
        renewalPriceCents: session.subtotalCents,
        priceSnapshot: session.planSnapshot as Prisma.InputJsonValue,
        discountSnapshot: (repeating
          ? (session.discountSnapshot as Prisma.InputJsonValue)
          : Prisma.JsonNull),
        discountRemainingCycles: repeating ? (discountSnapshot!.durationCycles ?? 1) - 1 : 0,
      };

      const subscription = await tx.subscription.upsert({
        where: {
          userId_workspaceId_module: {
            userId: session.userId,
            workspaceId: session.workspaceId,
            module: session.billingPlan.module,
          },
        },
        create: {
          userId: session.userId,
          workspaceId: session.workspaceId,
          module: session.billingPlan.module,
          ...subscriptionData,
        },
        update: subscriptionData,
      });

      billingMetric('billing_payment_success_total', {
        checkoutSessionId: session.id,
        paymentOrderId: order.id,
        subscriptionId: subscription.id,
        provider: params.provider,
      });
      billingLog('subscription_activated', {
        checkoutSessionId: session.id,
        paymentOrderId: order.id,
        subscriptionId: subscription.id,
        provider: params.provider,
        providerTransactionId: params.providerTransactionId,
        eventType: 'checkout_paid',
        statusFrom: session.status,
        statusTo: 'completed',
        purchaseType,
      });
      if (agreementActive) {
        billingMetric('billing_agreement_active_total', {
          checkoutSessionId: session.id,
          subscriptionId: subscription.id,
        });
      }

      // 12. Mark the event processed.
      await markEvent(tx, params.paymentEventId, 'processed', order.id);
      return 'activated';
    },
    { timeout: 15_000 },
  );
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
  });
}

export { addPeriodEnd };
