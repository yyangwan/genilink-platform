// State machines for the billing domain (spec §13).
// All status changes must go through these transition guards — API routes
// must never assign status strings directly.

import {
  type CheckoutSessionStatus,
  type PaymentAgreementStatus,
  type RenewalAttemptStatus,
} from '@/lib/billing/types';
import type { PaymentOrderStatus, SubscriptionStatus } from '@/types/billing';

export class BillingTransitionError extends Error {
  constructor(
    readonly entity: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Illegal ${entity} transition: ${from} -> ${to}`);
    this.name = 'BillingTransitionError';
  }
}

/** spec §13.1 + remediation §6.1: expired -> requires_review on a late paid
 * notification (money captured after local expiry — manual completion/refund). */
const CHECKOUT_SESSION_TRANSITIONS: Record<CheckoutSessionStatus, CheckoutSessionStatus[]> = {
  ready: ['processing', 'expired', 'canceled'],
  processing: ['ready', 'completed', 'failed', 'expired', 'requires_review'],
  completed: [],
  expired: ['requires_review'],
  requires_review: ['completed', 'canceled'],
  canceled: [],
  failed: [],
};

/** spec §13.2 */
const PAYMENT_ORDER_TRANSITIONS: Record<PaymentOrderStatus, PaymentOrderStatus[]> = {
  pending: ['opened', 'failed'],
  opened: ['processing', 'paid', 'expired', 'canceled', 'failed'],
  processing: ['paid', 'failed'],
  paid: ['refunded'],
  expired: [],
  canceled: [],
  failed: [],
  refunded: [],
};

/** spec §13.3 + remediation §4.2: revoking = channel revoke in flight (retryable) */
const PAYMENT_AGREEMENT_TRANSITIONS: Record<PaymentAgreementStatus, PaymentAgreementStatus[]> = {
  pending: ['active', 'failed'],
  active: ['revoking', 'revoked', 'expired'],
  revoking: ['revoked', 'failed'],
  revoked: [],
  expired: [],
  failed: [],
};

/** spec §13.4 (+ active -> active self-transition: renewal success on an already-active subscription) */
const SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  active: ['active', 'past_due', 'canceled', 'expired', 'inactive', 'trialing'],
  past_due: ['active', 'expired', 'canceled'],
  canceled: ['expired'],
  expired: [],
  trialing: ['active', 'expired', 'canceled', 'past_due', 'inactive'],
  inactive: ['active', 'trialing', 'expired'],
};

/**
 * RenewalAttempt lifecycle (spec §6.1/§12 + remediation §4.4):
 * scheduled -> processing -> awaiting_confirmation (charge submitted, waiting
 * for webhook/active query) -> succeeded; lease-expired processing can be
 * re-claimed; requires_review flags stuck attempts for manual handling.
 */
const RENEWAL_ATTEMPT_TRANSITIONS: Record<RenewalAttemptStatus, RenewalAttemptStatus[]> = {
  scheduled: ['notifying', 'processing', 'canceled'],
  notifying: ['processing', 'canceled'],
  processing: ['awaiting_confirmation', 'succeeded', 'retryable_failed', 'failed', 'canceled', 'requires_review'],
  awaiting_confirmation: ['processing', 'succeeded', 'retryable_failed', 'failed', 'requires_review', 'canceled'],
  retryable_failed: ['processing', 'failed', 'canceled'],
  succeeded: [],
  failed: [],
  canceled: [],
  requires_review: [],
};

function canTransition<T extends string>(
  table: Record<T, T[]>,
  entity: string,
  from: T,
  to: T,
): boolean {
  return table[from]?.includes(to) ?? false;
}

function assertTransition<T extends string>(
  table: Record<T, T[]>,
  entity: string,
  from: T,
  to: T,
): void {
  if (!canTransition(table, entity, from, to)) {
    throw new BillingTransitionError(entity, from, to);
  }
}

export const canTransitionCheckoutSession = (from: CheckoutSessionStatus, to: CheckoutSessionStatus) =>
  canTransition(CHECKOUT_SESSION_TRANSITIONS, 'CheckoutSession', from, to);
export const assertCheckoutSessionTransition = (from: CheckoutSessionStatus, to: CheckoutSessionStatus) =>
  assertTransition(CHECKOUT_SESSION_TRANSITIONS, 'CheckoutSession', from, to);

export const canTransitionPaymentOrder = (from: PaymentOrderStatus, to: PaymentOrderStatus) =>
  canTransition(PAYMENT_ORDER_TRANSITIONS, 'PaymentOrder', from, to);
export const assertPaymentOrderTransition = (from: PaymentOrderStatus, to: PaymentOrderStatus) =>
  assertTransition(PAYMENT_ORDER_TRANSITIONS, 'PaymentOrder', from, to);

export const canTransitionPaymentAgreement = (from: PaymentAgreementStatus, to: PaymentAgreementStatus) =>
  canTransition(PAYMENT_AGREEMENT_TRANSITIONS, 'PaymentAgreement', from, to);
export const assertPaymentAgreementTransition = (from: PaymentAgreementStatus, to: PaymentAgreementStatus) =>
  assertTransition(PAYMENT_AGREEMENT_TRANSITIONS, 'PaymentAgreement', from, to);

export const canTransitionSubscription = (from: SubscriptionStatus, to: SubscriptionStatus) =>
  canTransition(SUBSCRIPTION_TRANSITIONS, 'Subscription', from, to);
export const assertSubscriptionTransition = (from: SubscriptionStatus, to: SubscriptionStatus) =>
  assertTransition(SUBSCRIPTION_TRANSITIONS, 'Subscription', from, to);

export const canTransitionRenewalAttempt = (from: RenewalAttemptStatus, to: RenewalAttemptStatus) =>
  canTransition(RENEWAL_ATTEMPT_TRANSITIONS, 'RenewalAttempt', from, to);
export const assertRenewalAttemptTransition = (from: RenewalAttemptStatus, to: RenewalAttemptStatus) =>
  assertTransition(RENEWAL_ATTEMPT_TRANSITIONS, 'RenewalAttempt', from, to);
