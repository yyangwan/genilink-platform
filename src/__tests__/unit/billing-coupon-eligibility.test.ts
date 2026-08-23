import { describe, expect, it } from 'vitest';
import {
  normalizeCouponCode,
  validateCouponEligibility,
} from '@/lib/billing/promotions/service';

const now = new Date('2026-08-22T10:00:00.000Z');

const activeCoupon: { code: string; isActive: boolean; startsAt: Date | null; endsAt: Date | null } = {
  code: 'WELCOME20',
  isActive: true,
  startsAt: null,
  endsAt: null,
};

// Explicit nullable-field types: literal inference narrows `null` fields to
// the null type, which breaks partial overrides in the tests below.
const activePromotion: {
  id: string;
  name: string;
  discountType: string;
  discountValue: number;
  duration: string;
  durationCycles: number | null;
  minimumAmountCents: number | null;
  maximumDiscountCents: number | null;
  eligiblePlanKeys: string[] | null;
  eligibleBillingCycles: string[] | null;
  newCustomersOnly: boolean;
  maxRedemptions: number | null;
  maxPerUser: number;
  maxPerWorkspace: number;
  startsAt: Date;
  endsAt: Date | null;
  isActive: boolean;
} = {
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
  promotion?: Partial<typeof activePromotion>;
  plan?: typeof plan;
  counts?: typeof noUse;
  hasPriorPurchase?: boolean;
} = {}) {
  return validateCouponEligibility({
    coupon: overrides.coupon ?? activeCoupon,
    promotion: { ...activePromotion, ...(overrides.promotion ?? {}) },
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

// ─── Remediation §4.6.6: caps are counted at the PROMOTION level ────────────

describe('countRedemptions (promotion-level scope, remediation §4.6.6)', () => {
  it('counts reserved+redeemed via coupon.promotionId — NOT per coupon code', async () => {
    const { countRedemptions } = await import('@/lib/billing/promotions/service');
    const { prisma } = await import('@/lib/db');
    const { vi } = await import('vitest');
    vi.mocked(prisma.couponRedemption.count).mockResolvedValue(0 as never);

    await countRedemptions(prisma, {
      couponId: 'coupon-A',
      promotionId: 'promo-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });

    const calls = vi.mocked(prisma.couponRedemption.count).mock.calls;
    expect(calls.length).toBe(3);
    // Every count filters by the promotion through the coupon relation, so
    // multiple codes under one promotion cannot bypass promotion.maxRedemptions
    // or the per-user / per-workspace caps.
    for (const [args] of calls) {
      const where = (args as { where: Record<string, unknown> }).where;
      expect((where.coupon as Record<string, unknown>).promotionId).toBe('promo-1');
      expect(where.status).toEqual({ in: ['reserved', 'redeemed'] });
    }
    expect((calls[1][0] as { where: Record<string, unknown> }).where.userId).toBe('user-1');
    expect((calls[2][0] as { where: Record<string, unknown> }).where.workspaceId).toBe('workspace-1');
  });
});
