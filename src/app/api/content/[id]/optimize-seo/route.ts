import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { optimizeContentSeo } from '@/lib/content/service';
import {
  assertMonthlyUsageQuota,
  PlanLimitError,
  planLimitResponse,
  recordMonthlyUsage,
} from '@/lib/billing/usage';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    const { projectId, ...payload } = await req.json();
    try {
      await assertMonthlyUsageQuota(ctx.userId, ctx.workspaceId, 'seo_optimization');
      const data = await optimizeContentSeo(ctx, id, payload);
      await recordMonthlyUsage(ctx.userId, ctx.workspaceId, 'seo_optimization', 1, {
        projectId: ctx.projectId,
        contentId: id,
      });
      return NextResponse.json({ data });
    } catch (err) {
      if (err instanceof PlanLimitError) return planLimitResponse(err);
      return handleProxyError(err);
    }
  }, { action: 'write' })(req);
}
