import { createHash } from 'node:crypto';
import { z } from 'zod';
import { requireMiniProgramSession } from '@/lib/mini-program/identity';
import { createMarketingLead, LeadRateLimitError } from '@/lib/marketing/leads';
import { reportAccess } from '@/lib/mini-program/quick-checks';
import { miniJson, QuickCheckError, quickCheckRoute, readIdempotencyKey, readMiniBody } from '@/lib/mini-program/quick-check-http';

const inputSchema = z.object({
  brand: z.string().trim().min(1).max(120),
  scenario: z.string().trim().min(2).max(1000),
  contact: z.union([
    z.string().trim().min(2).max(200),
    z.object({
      phone: z.string().trim().max(30).optional(),
      email: z.string().trim().email().max(200).optional(),
      wechat: z.string().trim().max(100).optional(),
    }),
  ]),
  contactConsent: z.literal(true),
  privacyVersion: z.literal('2026-11-13'),
});

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return quickCheckRoute(async () => {
    const session = await requireMiniProgramSession(request);
    if (!session) throw new QuickCheckError(401, 'UNAUTHORIZED', '请先登录智链');
    if (process.env.LEAD_FORMS_ENABLED !== 'true') throw new QuickCheckError(503, 'LEAD_FORMS_DISABLED', '实测申请暂未开放');
    const { id } = await params;
    const report = await reportAccess(id, undefined, session.userId);
    const parsed = inputSchema.safeParse(await readMiniBody(request));
    if (!parsed.success) throw new QuickCheckError(400, 'INVALID_LEAD', '请填写品牌、使用场景和联系方式并确认联系授权');
    const { brand, scenario, contact, contactConsent, privacyVersion } = parsed.data;
    const channels = typeof contact === 'string'
      ? /^\+?[\d -]{7,30}$/.test(contact) ? { phone: contact }
        : contact.includes('@') ? { email: contact } : { wechat: contact }
      : contact;
    const key = readIdempotencyKey(request);
    const submissionToken = createHash('sha256').update(`mini-brand:${id}:${session.userId}:${key}`).digest('hex');
    const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    try {
      const { lead, withdrawalToken } = await createMarketingLead({
        kind: 'brand_visibility_check', companyName: brand, website: report.targetUrl,
        requirements: scenario, contactConsent, privacyVersion, submissionToken, ...channels,
      }, {
        clientIp: ip, userId: session.userId, quickCheck: { id, session: report.acquisitionSession },
      });
      return miniJson({ leadId: lead.id, withdrawalToken }, 201);
    } catch (error) {
      if (error instanceof LeadRateLimitError) throw new QuickCheckError(429, 'RATE_LIMITED', '申请过于频繁', error.retryAfterSeconds);
      if (error instanceof TypeError) throw new QuickCheckError(400, 'INVALID_LEAD', '请检查联系方式');
      throw error;
    }
  });
}
