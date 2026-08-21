import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { evaluateContentQuality } from '@/lib/content/service';
import {
  assertMonthlyUsageQuota,
  PlanLimitError,
  planLimitResponse,
  recordMonthlyUsage,
} from '@/lib/billing/usage';

type QualityResult = {
  quality?: number;
  score?: number;
  qualityScore?: number;
};

function normalizeScore(result: QualityResult): number | null {
  const raw = result.score ?? result.qualityScore ?? result.quality;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return raw <= 10 ? raw * 10 : raw;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    const { projectId, ...payload } = await req.json();

    try {
      await assertMonthlyUsageQuota(ctx.userId, ctx.workspaceId, 'content_score');
      const quality = await evaluateContentQuality(ctx, id, payload) as QualityResult;
      await recordMonthlyUsage(ctx.userId, ctx.workspaceId, 'content_score', 1, {
        projectId: ctx.projectId,
        contentId: id,
      });
      const score = normalizeScore(quality);
      return NextResponse.json({
        data: {
          ...quality,
          score,
          qualityScore: score,
        },
      });
    } catch (err) {
      if (err instanceof PlanLimitError) return planLimitResponse(err);
      return handleProxyError(err);
    }
  }, { action: 'write' })(req);
}
