import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { evaluateContentQuality } from '@/lib/content/service';

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
      const quality = await evaluateContentQuality(ctx, id, payload) as QualityResult;
      const score = normalizeScore(quality);
      return NextResponse.json({
        data: {
          ...quality,
          score,
          qualityScore: score,
        },
      });
    } catch (err) {
      return handleProxyError(err);
    }
  }, { action: 'write' })(req);
}
