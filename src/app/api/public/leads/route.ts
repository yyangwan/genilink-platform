import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createMarketingLead, LeadRateLimitError } from '@/lib/marketing/leads';

export const runtime = 'nodejs';
const MAX_BODY_BYTES = 16 * 1024;

const schema = z.object({
  kind: z.enum(['agency', 'private_deployment', 'managed_service']),
  companyName: z.string().trim().min(2).max(120),
  website: z.string().trim().max(500).optional().or(z.literal('')),
  industry: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  wechat: z.string().trim().max(100).optional(),
  projectCountBand: z.string().max(30).optional(),
  budgetBand: z.string().max(30).optional(),
  timeline: z.string().max(30).optional(),
  deploymentPreference: z.string().max(50).optional(),
  requirements: z.string().trim().max(2000).optional(),
  contactConsent: z.literal(true),
  privacyVersion: z.string().trim().min(1).max(40),
  submissionToken: z.string().uuid(),
  companyFax: z.string().max(200).optional(),
});

function clientIp(request: Request) {
  return request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(request: NextRequest) {
  if (process.env.LEAD_FORMS_ENABLED === 'false') {
    return NextResponse.json({ error: '合作咨询正在维护', code: 'LEAD_FORMS_DISABLED' }, { status: 503 });
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: '请求内容过大', code: 'BODY_TOO_LARGE' }, { status: 413 });
  }
  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: '请检查表单内容', code: 'INVALID_LEAD' }, { status: 400 });
  }
  if (parsed.companyFax) return NextResponse.json({ success: true }, { status: 201 });

  try {
    const created = await createMarketingLead(parsed, {
      visitorToken: request.cookies.get('genilink-acq')?.value,
      clientIp: clientIp(request),
    });
    return NextResponse.json({ success: true, leadId: created.lead.id, withdrawalToken: created.withdrawalToken }, {
      status: 201, headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof LeadRateLimitError) {
      return NextResponse.json({ error: '提交过于频繁，请稍后重试', code: 'RATE_LIMITED' }, {
        status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) },
      });
    }
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message, code: 'INVALID_LEAD' }, { status: 400 });
    }
    console.error('Failed to create marketing lead', error);
    return NextResponse.json({ error: '提交失败，请稍后重试', code: 'LEAD_CREATE_FAILED' }, { status: 503 });
  }
}
