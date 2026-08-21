import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { getContentQuality, evaluateContentQuality } from '@/lib/content/service';
import {
  assertMonthlyUsageQuota,
  PlanLimitError,
  planLimitResponse,
  recordMonthlyUsage,
} from '@/lib/billing/usage';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    try {
      return NextResponse.json({ data: await getContentQuality(ctx, id) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'read' })(req);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    const { projectId, ...payload } = await req.json();
    try {
      await assertMonthlyUsageQuota(ctx.userId, ctx.workspaceId, 'content_score');
      const data = await evaluateContentQuality(ctx, id, payload);
      await recordMonthlyUsage(ctx.userId, ctx.workspaceId, 'content_score', 1, {
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
