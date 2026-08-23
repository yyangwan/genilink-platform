// Server-side pricing — the ONLY place final amounts are computed (spec §7.1).
// Pure functions; no prisma/network imports.

import { getTierFromPlanKey } from '@/lib/billing/tiers';
import type {
  BillingCycle,
  BillingProductType,
} from '@/types/billing';
import type {
  CheckoutQuote,
  DiscountSnapshot,
  DiscountType,
  DiscountDuration,
  PlanSnapshot,
} from '@/lib/billing/types';

export type PlanPriceInput = {
  key: string;
  name: string;
  billingCycle: string;
  module: string;
  priceCents: number;
  currency: string;
};

export type PromotionRuleInput = {
  id: string;
  name: string;
  discountType: string;
  discountValue: number;
  duration: string;
  durationCycles: number | null;
  maximumDiscountCents: number | null;
};

export type CouponCodeInput = {
  code: string;
};

export type PurchaseType = 'new' | 'upgrade' | 'manual_renewal';

/** Raw discount for a promotion rule, before caps (spec §7.2/§7.3). */
export function rawDiscountCents(
  subtotalCents: number,
  promotion: Pick<PromotionRuleInput, 'discountType' | 'discountValue'>,
): number {
  if (promotion.discountType === 'percentage') {
    // discountValue in basis points: 10000 = 100%, 2000 = 20% off.
    return Math.floor((subtotalCents * promotion.discountValue) / 10000);
  }
  // fixed_amount: discountValue is already in cents.
  return promotion.discountValue;
}

/**
 * Compute the full checkout quote including frozen snapshots.
 * Invariants (spec §6.4): amountDueCents = subtotalCents - discountCents >= 1,
 * discountCents <= subtotalCents - 1.
 */
export function calculateCheckoutQuote(input: {
  plan: PlanPriceInput;
  promotion?: PromotionRuleInput | null;
  coupon?: CouponCodeInput | null;
  purchaseType: PurchaseType;
  now: Date;
}): CheckoutQuote {
  const subtotalCents = input.plan.priceCents;

  const planSnapshot: PlanSnapshot = {
    key: input.plan.key,
    name: input.plan.name,
    tier: getTierFromPlanKey(input.plan.key),
    billingCycle: input.plan.billingCycle,
    module: input.plan.module,
    priceCents: input.plan.priceCents,
    currency: input.plan.currency,
  };

  if (!input.promotion || subtotalCents <= 0) {
    return {
      currency: 'CNY',
      subtotalCents,
      discountCents: 0,
      amountDueCents: subtotalCents,
      renewalAmountCents: subtotalCents,
      planSnapshot,
      discountSnapshot: null,
    };
  }

  let discountCents = rawDiscountCents(subtotalCents, input.promotion);
  if (
    input.promotion.maximumDiscountCents !== null &&
    input.promotion.maximumDiscountCents !== undefined &&
    input.promotion.maximumDiscountCents > 0
  ) {
    discountCents = Math.min(discountCents, input.promotion.maximumDiscountCents);
  }
  // Never reduce below 1 cent due.
  discountCents = Math.max(0, Math.min(discountCents, subtotalCents - 1));

  const amountDueCents = subtotalCents - discountCents;

  const duration = (input.promotion.duration === 'repeating' ? 'repeating' : 'once') as DiscountDuration;
  const durationCycles = duration === 'repeating' ? (input.promotion.durationCycles ?? 1) : 1;

  // Renewal price after the promotional window ends (spec §7.6): multi-cycle
  // promotions keep the discounted price while cycles remain; then standard price.
  const renewalAmountCents =
    duration === 'repeating' && durationCycles > 1 ? amountDueCents : subtotalCents;

  const discountSnapshot: DiscountSnapshot = {
    promotionId: input.promotion.id,
    promotionName: input.promotion.name,
    couponCode: input.coupon?.code ?? '',
    discountType: input.promotion.discountType as DiscountType,
    discountValue: input.promotion.discountValue,
    duration,
    durationCycles: input.promotion.durationCycles ?? null,
    maximumDiscountCents: input.promotion.maximumDiscountCents ?? null,
    discountCents,
  };

  return {
    currency: 'CNY',
    subtotalCents,
    discountCents,
    amountDueCents,
    renewalAmountCents,
    planSnapshot,
    discountSnapshot,
  };
}

/**
 * Renewal-time pricing: derived ONLY from the subscription snapshot, never from
 * live Promotion config (spec §7.6). `renewalPriceCents` MUST be the
 * undiscounted base price (remediation §4.5: storing a discounted amount as
 * the base and subtracting the snapshot discount again applied it twice).
 * The per-cycle discount is recomputed from the snapshot RULE (type + value)
 * against that base, so consecutive discounts apply exactly once per cycle.
 */
export function calculateRenewalQuote(input: {
  renewalPriceCents: number;
  discountSnapshot: {
    discountType?: string;
    discountValue?: number;
    maximumDiscountCents?: number | null;
    discountCents?: number;
    duration?: string;
    durationCycles?: number | null;
  } | null;
  discountRemainingCycles: number;
}): { amountCents: number; remainingCyclesAfter: number } {
  const base = input.renewalPriceCents;
  const snapshot = input.discountSnapshot;
  const repeating =
    snapshot?.duration === 'repeating' &&
    (snapshot.durationCycles ?? 1) > 1 &&
    input.discountRemainingCycles > 0;

  if (!repeating) {
    return { amountCents: Math.max(1, base), remainingCyclesAfter: 0 };
  }

  // Recompute the cycle discount from the rule (remediation §4.5.4) — falls
  // back to the frozen first-cycle amount for snapshots that predate the
  // type/value fields.
  let discountCents: number;
  if (snapshot!.discountType && typeof snapshot!.discountValue === 'number') {
    discountCents = rawDiscountCents(base, {
      discountType: snapshot!.discountType,
      discountValue: snapshot!.discountValue,
    });
    const cap = snapshot!.maximumDiscountCents;
    if (typeof cap === 'number' && cap > 0) discountCents = Math.min(discountCents, cap);
  } else {
    discountCents = snapshot!.discountCents ?? 0;
  }
  discountCents = Math.max(0, Math.min(discountCents, base - 1));

  return {
    amountCents: base - discountCents,
    remainingCyclesAfter: input.discountRemainingCycles - 1,
  };
}
