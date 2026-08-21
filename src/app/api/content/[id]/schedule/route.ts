import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { getContentSchedule, setContentSchedule, deleteContentSchedule } from '@/lib/content/service';
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
      return NextResponse.json({ data: await getContentSchedule(ctx, id) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'read' })(req);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    const { projectId, ...payload } = await req.json();
    try {
      await assertMonthlyUsageQuota(ctx.userId, ctx.workspaceId, 'calendar_item');
      const data = await setContentSchedule(ctx, id, payload);
      await recordMonthlyUsage(ctx.userId, ctx.workspaceId, 'calendar_item', 1, {
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    try {
      await deleteContentSchedule(ctx, id);
      return NextResponse.json({ success: true });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'write' })(req);
}
