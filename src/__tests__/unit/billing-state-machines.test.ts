import { describe, expect, it } from 'vitest';
import {
  assertCheckoutSessionTransition,
  assertPaymentAgreementTransition,
  assertPaymentOrderTransition,
  assertRenewalAttemptTransition,
  assertSubscriptionTransition,
  BillingTransitionError,
  canTransitionCheckoutSession,
  canTransitionPaymentOrder,
} from '@/lib/billing/state-machines';

describe('CheckoutSession state machine (spec §13.1)', () => {
  it('allows ready -> processing -> completed', () => {
    expect(() => assertCheckoutSessionTransition('ready', 'processing')).not.toThrow();
    expect(() => assertCheckoutSessionTransition('processing', 'completed')).not.toThrow();
  });

  it('allows processing -> ready after payment failure so the channel can be switched', () => {
    expect(() => assertCheckoutSessionTransition('processing', 'ready')).not.toThrow();
  });

  it('allows ready -> expired / canceled and processing -> failed / expired', () => {
    expect(() => assertCheckoutSessionTransition('ready', 'expired')).not.toThrow();
    expect(() => assertCheckoutSessionTransition('ready', 'canceled')).not.toThrow();
    expect(() => assertCheckoutSessionTransition('processing', 'failed')).not.toThrow();
    expect(() => assertCheckoutSessionTransition('processing', 'expired')).not.toThrow();
  });

  it('rejects illegal transitions', () => {
    expect(() => assertCheckoutSessionTransition('completed', 'ready')).toThrow(BillingTransitionError);
    expect(() => assertCheckoutSessionTransition('expired', 'processing')).toThrow(BillingTransitionError);
    expect(() => assertCheckoutSessionTransition('ready', 'completed')).toThrow(BillingTransitionError);
    expect(canTransitionCheckoutSession('canceled', 'processing')).toBe(false);
  });
});

describe('PaymentOrder state machine (spec §13.2)', () => {
  it('follows pending -> opened -> processing -> paid', () => {
    expect(() => assertPaymentOrderTransition('pending', 'opened')).not.toThrow();
    expect(() => assertPaymentOrderTransition('opened', 'processing')).not.toThrow();
    expect(() => assertPaymentOrderTransition('processing', 'paid')).not.toThrow();
    expect(() => assertPaymentOrderTransition('opened', 'paid')).not.toThrow();
  });

  it('supports failure, expiry, cancel and refund paths', () => {
    expect(canTransitionPaymentOrder('pending', 'failed')).toBe(true);
    expect(canTransitionPaymentOrder('opened', 'expired')).toBe(true);
    expect(canTransitionPaymentOrder('opened', 'canceled')).toBe(true);
    expect(canTransitionPaymentOrder('processing', 'failed')).toBe(true);
    expect(canTransitionPaymentOrder('paid', 'refunded')).toBe(true);
  });

  it('rejects paid -> opened and pending -> paid', () => {
    expect(() => assertPaymentOrderTransition('paid', 'opened')).toThrow(BillingTransitionError);
    expect(() => assertPaymentOrderTransition('pending', 'paid')).toThrow(BillingTransitionError);
  });
});

describe('PaymentAgreement state machine (spec §13.3)', () => {
  it('follows the frozen transitions', () => {
    expect(() => assertPaymentAgreementTransition('pending', 'active')).not.toThrow();
    expect(() => assertPaymentAgreementTransition('pending', 'failed')).not.toThrow();
    expect(() => assertPaymentAgreementTransition('active', 'revoked')).not.toThrow();
    expect(() => assertPaymentAgreementTransition('active', 'expired')).not.toThrow();
    expect(() => assertPaymentAgreementTransition('revoked', 'active')).toThrow(BillingTransitionError);
  });
});

describe('Subscription state machine (spec §13.4)', () => {
  it('supports active <-> past_due and terminal paths', () => {
    expect(() => assertSubscriptionTransition('active', 'past_due')).not.toThrow();
    expect(() => assertSubscriptionTransition('past_due', 'active')).not.toThrow();
    expect(() => assertSubscriptionTransition('active', 'canceled')).not.toThrow();
    expect(() => assertSubscriptionTransition('active', 'expired')).not.toThrow();
    expect(() => assertSubscriptionTransition('past_due', 'expired')).not.toThrow();
    expect(() => assertSubscriptionTransition('expired', 'active')).toThrow(BillingTransitionError);
  });
});

describe('RenewalAttempt state machine', () => {
  it('supports scheduled -> processing -> succeeded and retry loops', () => {
    expect(() => assertRenewalAttemptTransition('scheduled', 'processing')).not.toThrow();
    expect(() => assertRenewalAttemptTransition('processing', 'succeeded')).not.toThrow();
    expect(() => assertRenewalAttemptTransition('processing', 'retryable_failed')).not.toThrow();
    expect(() => assertRenewalAttemptTransition('retryable_failed', 'processing')).not.toThrow();
    expect(() => assertRenewalAttemptTransition('processing', 'failed')).not.toThrow();
    expect(() => assertRenewalAttemptTransition('succeeded', 'processing')).toThrow(BillingTransitionError);
  });
});
