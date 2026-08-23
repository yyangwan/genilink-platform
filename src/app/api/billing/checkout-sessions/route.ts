import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { billingErrorResponse, getAuthContext } from '@/lib/billing/http';
import { toBillingError } from '@/lib/billing/types';
import { getIdempotencyKey } from '@/lib/billing/idempotency';
import {
  createCheckoutSession,
  serializeCheckoutSession,
} from '@/lib/billing/checkout/service';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  planKey: z.string().min(1),
  couponCode: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const { userId, workspaceId } = await getAuthContext();

    let body: z.infer<typeof createSchema>;
    try {
      body = createSchema.parse(await req.json());
    } catch {
      throw toBillingError('INVALID_REQUEST');
    }

    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      throw toBillingError('IDEMPOTENCY_KEY_REQUIRED');
    }

    const result = await createCheckoutSession({
      userId,
      workspaceId,
      planKey: body.planKey,
      couponCode: body.couponCode ?? null,
      idempotencyKey,
      requestBody: { planKey: body.planKey, couponCode: body.couponCode ?? null },
    });

    const view = await serializeCheckoutSession(result.session);
    return NextResponse.json({ checkoutSession: view }, { status: 201 });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
