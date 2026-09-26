import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalServiceAuth } from '@/lib/auth/internal-service-auth';
import { COMMERCIAL_OFFER } from '@/config/commercial-offer';
import { BILLING_PLAN_SEEDS } from '@/lib/billing/catalog';
import { syncBillingPlans } from '@/lib/billing/service';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = verifyInternalServiceAuth(request, 'BILLING_CRON_SECRET');
  if (!auth.ok) return auth.response;

  if (BILLING_PLAN_SEEDS.some((plan) => plan.isActive && plan.priceCents <= 0)) {
    return NextResponse.json({ error: { code: 'INVALID_CATALOG', message: '启用套餐价格必须大于 0' } }, { status: 500 });
  }

  try {
    await syncBillingPlans();
    return NextResponse.json({
      data: {
        offerId: COMMERCIAL_OFFER.offerId,
        effectiveFrom: COMMERCIAL_OFFER.effectiveFrom,
        currency: COMMERCIAL_OFFER.currency,
        plans: BILLING_PLAN_SEEDS.map(({ key, priceCents, isActive }) => ({ key, priceCents, isActive })),
      },
    });
  } catch (error) {
    console.error('Billing catalog synchronization failed', error);
    return NextResponse.json({ error: { code: 'CATALOG_SYNC_FAILED', message: '套餐目录同步失败' } }, { status: 500 });
  }
}
