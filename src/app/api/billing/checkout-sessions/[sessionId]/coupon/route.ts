import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { billingErrorResponse, getAuthContext } from '@/lib/billing/http';
import { toBillingError } from '@/lib/billing/types';
import {
  applyCouponToSession,
  removeCouponFromSession,
  serializeCheckoutSession,
} from '@/lib/billing/checkout/service';

export const dynamic = 'force-dynamic';

const applySchema = z.object({ code: z.string().min(1) });

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await ctx.params;
    const { userId, workspaceId } = await getAuthContext();

    let body: z.infer<typeof applySchema>;
    try {
      body = applySchema.parse(await req.json());
    } catch {
      throw toBillingError('INVALID_REQUEST');
    }

    const session = await applyCouponToSession({
      sessionId,
      userId,
      workspaceId,
      code: body.code,
    });
    const view = await serializeCheckoutSession(session);
    return NextResponse.json({ checkoutSession: view });
  } catch (error) {
    return billingErrorResponse(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await ctx.params;
    const { userId, workspaceId } = await getAuthContext();

    const session = await removeCouponFromSession({ sessionId, userId, workspaceId });
    const view = await serializeCheckoutSession(session);
    return NextResponse.json({ checkoutSession: view });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
