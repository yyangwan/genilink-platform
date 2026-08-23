import { NextRequest, NextResponse } from 'next/server';
import { billingErrorResponse, getAuthContext } from '@/lib/billing/http';
import { disableAutoRenew } from '@/lib/billing/renewals/service';

export const dynamic = 'force-dynamic';

/**
 * Turn off auto-renewal (spec §8.6). The current period stays valid; renewal
 * attempts are canceled. 202 when channel revocation is still pending.
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ subscriptionId: string }> },
) {
  try {
    const { subscriptionId } = await ctx.params;
    const { userId, workspaceId } = await getAuthContext();

    const result = await disableAutoRenew({ subscriptionId, userId, workspaceId });

    if (result.status === 'revoking') {
      return NextResponse.json(
        { status: 'revoking', message: '正在关闭自动续期' },
        { status: 202 },
      );
    }
    return NextResponse.json({ status: 'closed', message: '已关闭自动续期' });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
