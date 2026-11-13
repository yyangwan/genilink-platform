import { prisma } from '@/lib/db';
import { requireMiniProgramSession } from '@/lib/mini-program/identity';
import { LeadRateLimitError, LeadWithdrawalNotFoundError, withdrawMarketingLeadContact } from '@/lib/marketing/leads';
import { reportAccess } from '@/lib/mini-program/quick-checks';
import { miniJson, QuickCheckError, quickCheckRoute, readMiniBody } from '@/lib/mini-program/quick-check-http';

export function DELETE(request: Request, { params }: { params: Promise<{ id: string; leadId: string }> }) {
  return quickCheckRoute(async () => {
    const session = await requireMiniProgramSession(request);
    if (!session) throw new QuickCheckError(401, 'UNAUTHORIZED', '请先登录智链');
    const { id, leadId } = await params;
    await reportAccess(id, undefined, session.userId);
    const unavailable = new QuickCheckError(404, 'LEAD_NOT_FOUND', '未找到这份实测申请');
    const lead = await prisma.marketingLead.findFirst({
      where: { id: leadId, userId: session.userId, kind: 'brand_visibility_check', websiteQuickCheckId: id },
      select: { id: true },
    });
    if (!lead) throw unavailable;
    const body = await readMiniBody(request);
    if (typeof body.withdrawalToken !== 'string') throw unavailable;
    try {
      const result = await withdrawMarketingLeadContact({
        leadId, token: body.withdrawalToken,
        clientIp: request.headers.get('x-real-ip') || 'unknown',
      });
      return miniJson(result);
    } catch (error) {
      if (error instanceof LeadRateLimitError) throw new QuickCheckError(429, 'RATE_LIMITED', '操作过于频繁', error.retryAfterSeconds);
      if (error instanceof LeadWithdrawalNotFoundError) throw unavailable;
      throw error;
    }
  });
}
