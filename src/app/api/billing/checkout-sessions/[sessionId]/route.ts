import { NextRequest, NextResponse } from 'next/server';
import { billingErrorResponse, getAuthContext } from '@/lib/billing/http';
import { toBillingError } from '@/lib/billing/types';
import {
  expireStaleSessions,
  getCheckoutSessionView,
} from '@/lib/billing/checkout/service';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await ctx.params;
    const { userId, workspaceId } = await getAuthContext();

    // Opportunistic expiry sweep so stale sessions are reported correctly even
    // without the cron endpoint running.
    await expireStaleSessions().catch(() => undefined);

    const view = await getCheckoutSessionView({ sessionId, userId, workspaceId });
    if (!view) {
      throw toBillingError('NOT_FOUND');
    }
    return NextResponse.json({ checkoutSession: view });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
