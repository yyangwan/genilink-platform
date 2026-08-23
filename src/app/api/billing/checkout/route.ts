import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { billingErrorResponse, getAuthContext } from '@/lib/billing/http';
import { toBillingError } from '@/lib/billing/types';
import { requestHash } from '@/lib/billing/idempotency';
import { createCheckoutSession } from '@/lib/billing/checkout/service';

export const dynamic = 'force-dynamic';

/**
 * Legacy entry point kept as a thin delegate (spec §17 M2): it now creates a
 * CheckoutSession and returns the standalone cashier URL in the old response
 * shape. New clients should call /api/billing/checkout-sessions directly.
 */
const checkoutSchema = z.object({
  planKey: z.string().min(1),
  provider: z.enum(['wechatpay', 'alipay']).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { userId, workspaceId } = await getAuthContext();

    let body: z.infer<typeof checkoutSchema>;
    try {
      body = checkoutSchema.parse(await req.json());
    } catch {
      throw toBillingError('INVALID_REQUEST');
    }

    const result = await createCheckoutSession({
      userId,
      workspaceId,
      planKey: body.planKey,
      couponCode: null,
      idempotencyKey: `legacy:${userId}:${requestHash({ planKey: body.planKey, provider: body.provider ?? null, at: Date.now() })}`,
      requestBody: body,
    });

    const checkoutUrl = `/checkout/${result.session.id}`;
    return NextResponse.json({
      order: {
        id: result.session.id,
        status: result.session.status,
        checkoutUrl,
        providerSessionId: result.session.id,
        provider: body.provider ?? 'wechatpay',
      },
      checkoutUrl,
      provider: body.provider ?? 'wechatpay',
    });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
