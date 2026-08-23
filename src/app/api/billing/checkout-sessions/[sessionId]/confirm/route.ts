import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { billingErrorResponse, getAuthContext } from '@/lib/billing/http';
import { toBillingError } from '@/lib/billing/types';
import { getIdempotencyKey } from '@/lib/billing/idempotency';
import { createPaymentAttempt } from '@/lib/billing/payments/orchestrator';
import type { BillingProvider } from '@/types/billing';

export const dynamic = 'force-dynamic';

const confirmSchema = z.object({
  provider: z.enum(['wechatpay', 'alipay']),
  autoRenew: z.boolean().optional().default(false),
  agreementAcceptedVersion: z.string().optional().nullable(),
  forceNewAttempt: z.boolean().optional().default(false),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await ctx.params;
    const { userId, workspaceId } = await getAuthContext();

    let body: z.infer<typeof confirmSchema>;
    try {
      body = confirmSchema.parse(await req.json());
    } catch {
      throw toBillingError('INVALID_REQUEST');
    }

    const result = await createPaymentAttempt({
      sessionId,
      userId,
      workspaceId,
      provider: body.provider as BillingProvider,
      autoRenew: body.autoRenew,
      agreementAcceptedVersion: body.agreementAcceptedVersion ?? null,
      idempotencyKey: getIdempotencyKey(req),
      forceNewAttempt: body.forceNewAttempt,
      requestIp:
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        req.headers.get('x-real-ip') ??
        null,
      requestUa: req.headers.get('user-agent'),
      requestOrigin: req.headers.get('origin'),
    });

    return NextResponse.json(result);
  } catch (error) {
    return billingErrorResponse(error);
  }
}
