import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  LeadRateLimitError,
  LeadWithdrawalNotFoundError,
  withdrawMarketingLeadContact,
} from '@/lib/marketing/leads';

export const runtime = 'nodejs';
const MAX_BODY_BYTES = 2048;
const schema = z.object({
  withdrawalToken: z.string().min(40).max(100),
  reason: z.string().trim().max(500).optional(),
});

function clientIp(request: Request) {
  return request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: '请求内容过大', code: 'BODY_TOO_LARGE' }, { status: 413 });
  }
  try {
    const { id } = await params;
    const input = schema.parse(JSON.parse(raw));
    const result = await withdrawMarketingLeadContact({
      leadId: id,
      token: input.withdrawalToken,
      reason: input.reason,
      clientIp: clientIp(request),
    });
    return NextResponse.json({ success: true, withdrawnAt: result.withdrawnAt.toISOString() }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: '请检查撤回请求', code: 'INVALID_REQUEST' }, { status: 400 });
    }
    if (error instanceof LeadRateLimitError) {
      return NextResponse.json({ error: '操作过于频繁，请稍后重试', code: 'RATE_LIMITED' }, {
        status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) },
      });
    }
    if (error instanceof LeadWithdrawalNotFoundError) {
      return NextResponse.json({ error: '撤回凭证无效', code: 'WITHDRAWAL_NOT_FOUND' }, { status: 404 });
    }
    console.error('Failed to withdraw marketing lead contact', error);
    return NextResponse.json({ error: '撤回失败，请稍后重试', code: 'WITHDRAWAL_FAILED' }, { status: 503 });
  }
}
