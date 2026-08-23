// Promotion / coupon domain service (spec §7.4-§7.6, M3).
//
// Applying a coupon only computes a quote — it never consumes quota. Quota is
// reserved inside the confirm transaction with row locks, and released when
// the session expires / cancels / fails.

import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { billingLog, billingMetric } from '@/lib/billing/log';
import { toBillingError, type CouponErrorCode } from '@/lib/billing/types';
import { calculateCheckoutQuote, type PlanPriceInput, type PromotionRuleInput } from '@/lib/billing/checkout/quote';

export type PromotionWithCoupons = {
  name: string;
  description?: string | null;
  discountType: 'fixed_amount' | 'percentage';
  discountValue: number;
  duration: 'once' | 'repeating';
  durationCycles?: number | null;
  minimumAmountCents?: number | null;
  maximumDiscountCents?: number | null;
  eligiblePlanKeys?: string[] | null;
  eligibleBillingCycles?: string[] | null;
  newCustomersOnly?: boolean;
  maxRedemptions?: number | null;
  maxPerUser?: number;
  maxPerWorkspace?: number;
  startsAt: string;
  endsAt?: string | null;
  coupons: Array<{ code: string }>;
};

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

export type CouponRecord = {
  id: string;
  code: string;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  promotion: PromotionRecord;
};

export type PromotionRecord = {
  id: string;
  name: string;
  discountType: string;
  discountValue: number;
  duration: string;
  durationCycles: number | null;
  minimumAmountCents: number | null;
  maximumDiscountCents: number | null;
  eligiblePlanKeys: unknown;
  eligibleBillingCycles: unknown;
  newCustomersOnly: boolean;
  maxRedemptions: number | null;
  maxPerUser: number;
  maxPerWorkspace: number;
  startsAt: Date;
  endsAt: Date | null;
  isActive: boolean;
};

export type RedemptionCounts = {
  totalReservedOrRedeemed: number;
  byUser: number;
  byWorkspace: number;
};

function asStringArray(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return null;
}

export function promotionRuleInput(promotion: PromotionRecord): PromotionRuleInput {
  return {
    id: promotion.id,
    name: promotion.name,
    discountType: promotion.discountType,
    discountValue: promotion.discountValue,
    duration: promotion.duration,
    durationCycles: promotion.durationCycles,
    maximumDiscountCents: promotion.maximumDiscountCents,
  };
}

/**
 * Coupon eligibility — pure validation in the frozen order (spec §7.4 steps 1-8).
 * Returns null when eligible, otherwise a COUPON_* error code.
 */
export function validateCouponEligibility(params: {
  coupon: {
    code: string;
    isActive: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
  };
  promotion: PromotionRecord;
  plan: { key: string; billingCycle: string; priceCents: number };
  now: Date;
  hasPriorPurchase: boolean;
  counts: RedemptionCounts;
}): CouponErrorCode | null {
  const { coupon, promotion, plan, now, counts } = params;

  // 1. Both the promotion and the coupon are active.
  if (!promotion.isActive || !coupon.isActive) return 'COUPON_INACTIVE';

  // 2. Current time is inside the promotion window.
  if (promotion.startsAt > now) return 'COUPON_NOT_STARTED';
  if (promotion.endsAt && promotion.endsAt < now) return 'COUPON_EXPIRED';
  if (coupon.startsAt && coupon.startsAt > now) return 'COUPON_NOT_STARTED';
  if (coupon.endsAt && coupon.endsAt < now) return 'COUPON_EXPIRED';

  // 3. Plan key scope.
  const eligiblePlanKeys = asStringArray(promotion.eligiblePlanKeys);
  if (eligiblePlanKeys && !eligiblePlanKeys.includes(plan.key)) return 'COUPON_NOT_ELIGIBLE';

  // 4. Billing cycle scope.
  const eligibleBillingCycles = asStringArray(promotion.eligibleBillingCycles);
  if (eligibleBillingCycles && !eligibleBillingCycles.includes(plan.billingCycle)) return 'COUPON_NOT_ELIGIBLE';

  // 5. Minimum spend.
  if (
    promotion.minimumAmountCents !== null &&
    promotion.minimumAmountCents !== undefined &&
    plan.priceCents < promotion.minimumAmountCents
  ) {
    return 'COUPON_MINIMUM_NOT_MET';
  }

  // 6. New-customer-only restriction.
  if (promotion.newCustomersOnly && params.hasPriorPurchase) return 'COUPON_ALREADY_USED';

  // 7. Global redemption cap.
  if (
    promotion.maxRedemptions !== null &&
    promotion.maxRedemptions !== undefined &&
    counts.totalReservedOrRedeemed >= promotion.maxRedemptions
  ) {
    return 'COUPON_REDEMPTION_LIMIT_REACHED';
  }

  // 8. Per-user / per-workspace caps. Existing reservations for this same
  //    session are idempotent, handled by the caller before counting.
  if (counts.byUser >= promotion.maxPerUser) return 'COUPON_ALREADY_USED';
  if (counts.byWorkspace >= promotion.maxPerWorkspace) return 'COUPON_ALREADY_USED';

  return null;
}

export async function findCouponByCode(
  prisma: PrismaClient | Tx,
  code: string,
): Promise<CouponRecord | null> {
  return (prisma as PrismaClient).coupon.findUnique({
    where: { code: normalizeCouponCode(code) },
    include: { promotion: true },
  }) as Promise<CouponRecord | null>;
}

export async function hasPriorPurchase(
  prisma: PrismaClient | Tx,
  params: { userId: string },
): Promise<boolean> {
  const count = await (prisma as PrismaClient).paymentOrder.count({
    where: { userId: params.userId, status: 'paid' },
  });
  return count > 0;
}

export async function countRedemptions(
  prisma: PrismaClient | Tx,
  params: { couponId: string; promotionId: string; userId: string; workspaceId: string },
): Promise<RedemptionCounts> {
  // Caps belong to the PROMOTION (remediation §4.6.6): counting per coupon
  // code let multi-code promotions bypass promotion.maxRedemptions and the
  // per-user / per-workspace limits.
  const statusFilter = { in: ['reserved', 'redeemed'] as string[] };
  const scope = { coupon: { promotionId: params.promotionId }, status: statusFilter };
  const [total, byUser, byWorkspace] = await Promise.all([
    (prisma as PrismaClient).couponRedemption.count({ where: scope }),
    (prisma as PrismaClient).couponRedemption.count({
      where: { ...scope, userId: params.userId },
    }),
    (prisma as PrismaClient).couponRedemption.count({
      where: { ...scope, workspaceId: params.workspaceId },
    }),
  ]);
  return { totalReservedOrRedeemed: total, byUser, byWorkspace };
}

/** Release a single reserved redemption (coupon switch / removal,
 * remediation §4.6.4/§4.6.5). Must run inside the caller's transaction. */
export async function releaseReservation(tx: Tx, redemptionId: string): Promise<void> {
  await tx.couponRedemption.update({
    where: { id: redemptionId, status: 'reserved' },
    data: { status: 'released', releasedAt: new Date() },
  });
}

/**
 * Reserve a coupon redemption inside the confirm transaction (spec §7.5):
 * lock Coupon + Promotion rows, re-validate everything, count usage, then
 * create (or reuse) the reservation and update the session price snapshot.
 * Must be called with tx (interactive transaction client).
 */
export async function reserveRedemption(
  tx: Tx,
  params: {
    checkoutSession: {
      id: string;
      userId: string;
      workspaceId: string;
      billingPlanId: string;
      couponId: string | null;
    };
    plan: PlanPriceInput;
    purchaseType: 'new' | 'upgrade' | 'manual_renewal';
    now: Date;
  },
): Promise<{ ok: true; discountCents: number } | { ok: false; code: CouponErrorCode }> {
  const session = params.checkoutSession;
  if (!session.couponId) return { ok: true, discountCents: 0 };

  // Idempotency: an existing reservation for this session is reused.
  const existing = await tx.couponRedemption.findUnique({
    where: { checkoutSessionId: session.id },
  });
  if (existing && existing.status === 'redeemed') {
    return { ok: true, discountCents: existing.discountCents };
  }

  // Lock coupon + promotion rows (spec §7.5 step 1).
  await tx.$queryRaw`SELECT * FROM "Coupon" WHERE "id" = ${session.couponId} FOR UPDATE`;
  await tx.$queryRaw`SELECT * FROM "Promotion" WHERE "id" = (SELECT "promotionId" FROM "Coupon" WHERE "id" = ${session.couponId}) FOR UPDATE`;

  const coupon = await tx.coupon.findUnique({
    where: { id: session.couponId },
    include: { promotion: true },
  });
  if (!coupon) return { ok: false, code: 'COUPON_NOT_FOUND' };

  const priorPurchase = await hasPriorPurchase(tx, { userId: session.userId });
  const counts = await countRedemptions(tx, {
    couponId: coupon.id,
    promotionId: coupon.promotion.id,
    userId: session.userId,
    workspaceId: session.workspaceId,
  });

  // When re-validating an existing reservation, exclude this session's own rows
  // from the per-user/workspace counts so a refresh doesn't self-collide.
  const adjustedCounts: RedemptionCounts = existing
    ? {
        totalReservedOrRedeemed: Math.max(0, counts.totalReservedOrRedeemed - (existing.status === 'reserved' ? 1 : 0)),
        byUser: Math.max(0, counts.byUser - (existing.status === 'reserved' ? 1 : 0)),
        byWorkspace: Math.max(0, counts.byWorkspace - (existing.status === 'reserved' ? 1 : 0)),
      }
    : counts;

  const errorCode = validateCouponEligibility({
    coupon,
    promotion: coupon.promotion,
    plan: params.plan,
    now: params.now,
    hasPriorPurchase: priorPurchase,
    counts: adjustedCounts,
  });
  if (errorCode) {
    billingMetric('billing_coupon_rejected_total', { couponId: coupon.id, errorCode });
    return { ok: false, code: errorCode };
  }

  const quote = calculateCheckoutQuote({
    plan: params.plan,
    promotion: promotionRuleInput(coupon.promotion),
    coupon: { code: coupon.code },
    purchaseType: params.purchaseType,
    now: params.now,
  });

  if (existing) {
    // Refresh the reservation with the re-validated discount. couponId is
    // repointed too: after remove → re-apply the row may still reference the
    // OLD coupon, which corrupts promotion-level caps across promotions
    // (second-review finding 4).
    await tx.couponRedemption.update({
      where: { id: existing.id },
      data: { couponId: coupon.id, discountCents: quote.discountCents, status: 'reserved' },
    });
  } else {
    await tx.couponRedemption.create({
      data: {
        couponId: coupon.id,
        checkoutSessionId: session.id,
        userId: session.userId,
        workspaceId: session.workspaceId,
        status: 'reserved',
        discountCents: quote.discountCents,
      },
    });
    billingMetric('billing_coupon_apply_total', { couponId: coupon.id, checkoutSessionId: session.id });
  }

  return { ok: true, discountCents: quote.discountCents };
}

/** Release reservations for sessions that expired / canceled / failed. */
export async function releaseRedemptionsForSessions(
  prisma: PrismaClient,
  sessionIds: string[],
): Promise<number> {
  if (sessionIds.length === 0) return 0;
  const result = await prisma.couponRedemption.updateMany({
    where: { checkoutSessionId: { in: sessionIds }, status: 'reserved' },
    data: { status: 'released', releasedAt: new Date() },
  });
  if (result.count > 0) {
    billingLog('coupon_redemption_released', { count: result.count });
  }
  return result.count;
}

// ─── Env-driven promotion seeding (mirrors syncBillingPlans) ────────────────

export function parsePromotionSeeds(raw: string | undefined): PromotionWithCoupons[] {
  if (!raw || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('BILLING_PROMOTION_SEEDS is not valid JSON — skipping promotion sync');
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is PromotionWithCoupons => {
    if (!item || typeof item !== 'object') return false;
    const record = item as Record<string, unknown>;
    return (
      typeof record.name === 'string' &&
      (record.discountType === 'fixed_amount' || record.discountType === 'percentage') &&
      typeof record.discountValue === 'number' &&
      typeof record.startsAt === 'string' &&
      Array.isArray(record.coupons) &&
      record.coupons.every((coupon) => coupon && typeof coupon === 'object' && typeof (coupon as { code?: unknown }).code === 'string')
    );
  });
}

/**
 * Upsert promotions + coupons from BILLING_PROMOTION_SEEDS env JSON. Sync is
 * best-effort and never throws into the request path.
 */
export async function syncPromotions(): Promise<void> {
  const seeds = parsePromotionSeeds(process.env.BILLING_PROMOTION_SEEDS);
  if (seeds.length === 0) return;

  try {
    for (const seed of seeds) {
      const promotion = await prisma.promotion.upsert({
        where: { name: seed.name },
        create: {
          name: seed.name,
          description: seed.description ?? null,
          discountType: seed.discountType,
          discountValue: seed.discountValue,
          duration: seed.duration,
          durationCycles: seed.durationCycles ?? null,
          minimumAmountCents: seed.minimumAmountCents ?? null,
          maximumDiscountCents: seed.maximumDiscountCents ?? null,
          eligiblePlanKeys: (seed.eligiblePlanKeys ?? null) as Prisma.InputJsonValue | undefined,
          eligibleBillingCycles: (seed.eligibleBillingCycles ?? null) as Prisma.InputJsonValue | undefined,
          newCustomersOnly: seed.newCustomersOnly ?? false,
          maxRedemptions: seed.maxRedemptions ?? null,
          maxPerUser: seed.maxPerUser ?? 1,
          maxPerWorkspace: seed.maxPerWorkspace ?? 1,
          startsAt: new Date(seed.startsAt),
          endsAt: seed.endsAt ? new Date(seed.endsAt) : null,
          isActive: true,
        },
        update: {
          description: seed.description ?? null,
          discountType: seed.discountType,
          discountValue: seed.discountValue,
          duration: seed.duration,
          durationCycles: seed.durationCycles ?? null,
          minimumAmountCents: seed.minimumAmountCents ?? null,
          maximumDiscountCents: seed.maximumDiscountCents ?? null,
          eligiblePlanKeys: (seed.eligiblePlanKeys ?? null) as Prisma.InputJsonValue | undefined,
          eligibleBillingCycles: (seed.eligibleBillingCycles ?? null) as Prisma.InputJsonValue | undefined,
          newCustomersOnly: seed.newCustomersOnly ?? false,
          maxRedemptions: seed.maxRedemptions ?? null,
          maxPerUser: seed.maxPerUser ?? 1,
          maxPerWorkspace: seed.maxPerWorkspace ?? 1,
          startsAt: new Date(seed.startsAt),
          endsAt: seed.endsAt ? new Date(seed.endsAt) : null,
          isActive: true,
        },
      });

      for (const couponSeed of seed.coupons) {
        await prisma.coupon.upsert({
          where: { code: normalizeCouponCode(couponSeed.code) },
          create: {
            promotionId: promotion.id,
            code: normalizeCouponCode(couponSeed.code),
            isActive: true,
          },
          update: {
            promotionId: promotion.id,
            isActive: true,
          },
        });
      }
    }
  } catch (error) {
    console.warn('Promotion sync skipped', error);
  }
}

export function couponError(code: CouponErrorCode) {
  return toBillingError(code);
}
