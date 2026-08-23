import { describe, expect, it } from 'vitest';
import { calculateCheckoutQuote, calculateRenewalQuote, rawDiscountCents } from '@/lib/billing/checkout/quote';

const PLAN = {
  key: 'suite-pro-yearly',
  name: '专业版年付',
  billingCycle: 'yearly',
  module: 'suite',
  priceCents: 399900,
  currency: 'CNY',
};

const now = new Date('2026-08-22T10:00:00.000Z');

describe('calculateCheckoutQuote (spec §7)', () => {
  it('returns the plan price with no discount when no promotion applies', () => {
    const quote = calculateCheckoutQuote({ plan: PLAN, purchaseType: 'new', now });
    expect(quote.subtotalCents).toBe(399900);
    expect(quote.discountCents).toBe(0);
    expect(quote.amountDueCents).toBe(399900);
    expect(quote.renewalAmountCents).toBe(399900);
    expect(quote.discountSnapshot).toBeNull();
    expect(quote.planSnapshot).toMatchObject({ key: 'suite-pro-yearly', tier: 'pro', billingCycle: 'yearly', priceCents: 399900 });
  });

  it('computes percentage discounts in basis points with floor rounding (spec §7.2)', () => {
    // 2000 bps = 20% off -> 399900 * 0.2 = 79980
    const quote = calculateCheckoutQuote({
      plan: PLAN,
      promotion: { id: 'p1', name: '首年优惠', discountType: 'percentage', discountValue: 2000, duration: 'once', durationCycles: null, maximumDiscountCents: null },
      purchaseType: 'new',
      now,
    });
    expect(quote.discountCents).toBe(79980);
    expect(quote.amountDueCents).toBe(319920);
    expect(quote.renewalAmountCents).toBe(399900); // once -> renewal restores full price
  });

  it('floors fractional cents on percentage discounts', () => {
    // 333 bps of 999 = 33.26 -> floor 33
    expect(rawDiscountCents(999, { discountType: 'percentage', discountValue: 333 })).toBe(33);
  });

  it('caps percentage discounts at maximumDiscountCents', () => {
    const quote = calculateCheckoutQuote({
      plan: PLAN,
      promotion: { id: 'p1', name: '封顶优惠', discountType: 'percentage', discountValue: 5000, duration: 'once', durationCycles: null, maximumDiscountCents: 50000 },
      purchaseType: 'new',
      now,
    });
    expect(quote.discountCents).toBe(50000);
    expect(quote.amountDueCents).toBe(349900);
  });

  it('treats fixed_amount values as cents (spec §7.3)', () => {
    const quote = calculateCheckoutQuote({
      plan: PLAN,
      promotion: { id: 'p1', name: '减50元', discountType: 'fixed_amount', discountValue: 5000, duration: 'once', durationCycles: null, maximumDiscountCents: null },
      purchaseType: 'new',
      now,
    });
    expect(quote.discountCents).toBe(5000);
    expect(quote.amountDueCents).toBe(394900);
  });

  it('never reduces the amount due below 1 cent (spec §6.4)', () => {
    const quote = calculateCheckoutQuote({
      plan: { ...PLAN, priceCents: 1 },
      promotion: { id: 'p1', name: '全免', discountType: 'percentage', discountValue: 10000, duration: 'once', durationCycles: null, maximumDiscountCents: null },
      purchaseType: 'new',
      now,
    });
    expect(quote.discountCents).toBe(0);
    expect(quote.amountDueCents).toBe(1);
  });

  it('keeps the discounted renewal price for multi-cycle repeating promotions (spec §7.6)', () => {
    const quote = calculateCheckoutQuote({
      plan: PLAN,
      promotion: { id: 'p1', name: '连续3期8折', discountType: 'percentage', discountValue: 2000, duration: 'repeating', durationCycles: 3, maximumDiscountCents: null },
      purchaseType: 'new',
      now,
    });
    expect(quote.renewalAmountCents).toBe(quote.amountDueCents);
    expect(quote.discountSnapshot).toMatchObject({ duration: 'repeating', durationCycles: 3 });
  });

  it('restores the standard renewal price for single-cycle repeating promotions', () => {
    const quote = calculateCheckoutQuote({
      plan: PLAN,
      promotion: { id: 'p1', name: '首期8折', discountType: 'percentage', discountValue: 2000, duration: 'repeating', durationCycles: 1, maximumDiscountCents: null },
      purchaseType: 'new',
      now,
    });
    expect(quote.renewalAmountCents).toBe(399900);
  });
});

describe('calculateRenewalQuote (snapshot-only pricing, spec §7.6)', () => {
  it('charges the standard price once discount cycles are exhausted', () => {
    const quote = calculateRenewalQuote({
      renewalPriceCents: 399900,
      discountSnapshot: { discountCents: 79980, duration: 'repeating', durationCycles: 3 },
      discountRemainingCycles: 0,
    });
    expect(quote.amountCents).toBe(399900);
    expect(quote.remainingCyclesAfter).toBe(0);
  });

  it('applies the snapshot discount while cycles remain and decrements on success', () => {
    const quote = calculateRenewalQuote({
      renewalPriceCents: 399900,
      discountSnapshot: { discountCents: 79980, duration: 'repeating', durationCycles: 3 },
      discountRemainingCycles: 2,
    });
    expect(quote.amountCents).toBe(319920);
    expect(quote.remainingCyclesAfter).toBe(1);
  });

  it('ignores once-type snapshots entirely', () => {
    const quote = calculateRenewalQuote({
      renewalPriceCents: 399900,
      discountSnapshot: { discountCents: 79980, duration: 'once', durationCycles: null },
      discountRemainingCycles: 5,
    });
    expect(quote.amountCents).toBe(399900);
  });

  it('never discounts below 1 cent', () => {
    const quote = calculateRenewalQuote({
      renewalPriceCents: 100,
      discountSnapshot: { discountCents: 500, duration: 'repeating', durationCycles: 3 },
      discountRemainingCycles: 1,
    });
    expect(quote.amountCents).toBe(1);
  });

  // ─── Remediation §4.5: the renewal base is the UNDISCOUNTED standard price;
  // the per-cycle discount is recomputed from the snapshot RULE. The old bug
  // stored the discounted amount as the base and subtracted again (double
  // discount: 100 -> 80 -> 60).

  it('does not double-discount: 20%-off × 3 cycles keeps every cycle at 80% of the base (remediation §4.5)', () => {
    const snapshot = {
      discountType: 'percentage',
      discountValue: 2000,
      maximumDiscountCents: null,
      discountCents: 2000, // first-cycle amount on a 10000-cent base
      duration: 'repeating',
      durationCycles: 3,
    };
    // Base = 10000 (standard). Cycles 1-2 remaining: 20% of the BASE each time.
    const cycle2 = calculateRenewalQuote({
      renewalPriceCents: 10000,
      discountSnapshot: snapshot,
      discountRemainingCycles: 2,
    });
    expect(cycle2.amountCents).toBe(8000); // not 6000
    expect(cycle2.remainingCyclesAfter).toBe(1);

    const cycle3 = calculateRenewalQuote({
      renewalPriceCents: 10000,
      discountSnapshot: snapshot,
      discountRemainingCycles: 1,
    });
    expect(cycle3.amountCents).toBe(8000);
    expect(cycle3.remainingCyclesAfter).toBe(0);

    const cycle4 = calculateRenewalQuote({
      renewalPriceCents: 10000,
      discountSnapshot: snapshot,
      discountRemainingCycles: 0,
    });
    expect(cycle4.amountCents).toBe(10000); // back to standard price
  });

  it('recomputes a fixed-amount snapshot against the base and stays >= 1 cent (remediation §4.5)', () => {
    const quote = calculateRenewalQuote({
      renewalPriceCents: 5000,
      discountSnapshot: {
        discountType: 'fixed_amount',
        discountValue: 9900, // larger than the price
        maximumDiscountCents: null,
        discountCents: 9900,
        duration: 'repeating',
        durationCycles: 2,
      },
      discountRemainingCycles: 1,
    });
    expect(quote.amountCents).toBe(1); // never negative
  });

  it('honors maximumDiscountCents when recomputing a percentage rule', () => {
    const quote = calculateRenewalQuote({
      renewalPriceCents: 100000,
      discountSnapshot: {
        discountType: 'percentage',
        discountValue: 2000, // 20000 raw
        maximumDiscountCents: 10000,
        discountCents: 10000,
        duration: 'repeating',
        durationCycles: 4,
      },
      discountRemainingCycles: 3,
    });
    expect(quote.amountCents).toBe(90000);
  });
});
