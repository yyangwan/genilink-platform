import { describe, expect, it } from 'vitest';
import {
  normalizeCouponCode,
  validateCouponEligibility,
} from '@/lib/billing/promotions/service';

const now = new Date('2026-08-22T10:00:00.000Z');

const activeCoupon = {
  code: 'WELCOME20',
  isActive: true,
  startsAt: null,
  endsAt: null,
};

const activePromotion = {
  id: 'promo-1',
  name: '首年优惠',
  discountType: 'percentage',
  discountValue: 2000,
  duration: 'once',
  durationCycles: null,
  minimumAmountCents: null,
  maximumDiscountCents: null,
  eligiblePlanKeys: null,
  eligibleBillingCycles: null,
  newCustomersOnly: false,
  maxRedemptions: null,
  maxPerUser: 1,
  maxPerWorkspace: 1,
  startsAt: new Date('2026-01-01T00:00:00.000Z'),
  endsAt: null,
  isActive: true,
};

const plan = { key: 'suite-pro-yearly', billingCycle: 'yearly', priceCents: 399900 };
const noUse = { totalReservedOrRedeemed: 0, byUser: 0, byWorkspace: 0 };

function validate(overrides: {
  coupon?: typeof activeCoupon;
  promotion?: typeof activePromotion;
  plan?: typeof plan;
  counts?: typeof noUse;
  hasPriorPurchase?: boolean;
} = {}) {
  return validateCouponEligibility({
    coupon: overrides.coupon ?? activeCoupon,
    promotion: { ...activePromotion, ...(overrides.promotion ?? {}) } as typeof activePromotion,
    plan: overrides.plan ?? plan,
    now,
    hasPriorPurchase: overrides.hasPriorPurchase ?? false,
    counts: overrides.counts ?? noUse,
  });
}

describe('normalizeCouponCode (spec §15)', () => {
  it('uppercases and trims', () => {
    expect(normalizeCouponCode('  welcome20  ')).toBe('WELCOME20');
  });
});

describe('validateCouponEligibility (spec §7.4 order 1-8)', () => {
  it('accepts a fully eligible coupon', () => {
    expect(validate()).toBeNull();
  });

  it('1. inactive promotion or coupon -> COUPON_INACTIVE', () => {
    expect(validate({ promotion: { isActive: false } })).toBe('COUPON_INACTIVE');
    expect(validate({ coupon: { ...activeCoupon, isActive: false } })).toBe('COUPON_INACTIVE');
  });

  it('2. window checks -> COUPON_NOT_STARTED / COUPON_EXPIRED', () => {
    expect(validate({ promotion: { startsAt: new Date('2026-09-01T00:00:00.000Z') } })).toBe('COUPON_NOT_STARTED');
    expect(validate({ promotion: { endsAt: new Date('2026-08-01T00:00:00.000Z') } })).toBe('COUPON_EXPIRED');
    expect(validate({ coupon: { ...activeCoupon, endsAt: new Date('2026-08-01T00:00:00.000Z') } })).toBe('COUPON_EXPIRED');
  });

  it('3. plan key scope -> COUPON_NOT_ELIGIBLE', () => {
    expect(
      validate({
        promotion: { eligiblePlanKeys: ['suite-lite-yearly'] },
      }),
    ).toBe('COUPON_NOT_ELIGIBLE');
  });

  it('4. billing cycle scope -> COUPON_NOT_ELIGIBLE', () => {
    expect(
      validate({
        promotion: { eligibleBillingCycles: ['monthly'] },
        plan: { ...plan },
      }),
    ).toBe('COUPON_NOT_ELIGIBLE');
    expect(
      validate({
        promotion: { eligibleBillingCycles: ['yearly'] },
      }),
    ).toBeNull();
  });

  it('5. minimum spend -> COUPON_MINIMUM_NOT_MET', () => {
    expect(validate({ promotion: { minimumAmountCents: 400000 } })).toBe('COUPON_MINIMUM_NOT_MET');
    expect(validate({ promotion: { minimumAmountCents: 399900 } })).toBeNull();
  });

  it('6. new customers only -> COUPON_ALREADY_USED for prior purchasers', () => {
    expect(validate({ promotion: { newCustomersOnly: true }, hasPriorPurchase: true })).toBe('COUPON_ALREADY_USED');
    expect(validate({ promotion: { newCustomersOnly: true }, hasPriorPurchase: false })).toBeNull();
  });

  it('7. global redemption cap -> COUPON_REDEMPTION_LIMIT_REACHED', () => {
    expect(validate({ promotion: { maxRedemptions: 100 }, counts: { ...noUse, totalReservedOrRedeemed: 100 } })).toBe('COUPON_REDEMPTION_LIMIT_REACHED');
    expect(validate({ promotion: { maxRedemptions: 100 }, counts: { ...noUse, totalReservedOrRedeemed: 99 } })).toBeNull();
  });

  it('8. per-user and per-workspace caps -> COUPON_ALREADY_USED', () => {
    expect(validate({ counts: { ...noUse, byUser: 1 } })).toBe('COUPON_ALREADY_USED');
    expect(validate({ counts: { ...noUse, byWorkspace: 1 } })).toBe('COUPON_ALREADY_USED');
    expect(validate({ promotion: { maxPerWorkspace: 2 }, counts: { ...noUse, byWorkspace: 1 } })).toBeNull();
  });

  it('checks in the frozen order: inactive wins over expired', () => {
    expect(
      validate({
        promotion: { isActive: false, endsAt: new Date('2026-08-01T00:00:00.000Z') },
      }),
    ).toBe('COUPON_INACTIVE');
  });
});
