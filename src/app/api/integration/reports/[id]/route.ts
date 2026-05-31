import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const { id } = await params;

  // Fetch own brand names from prisma (ProjectBrand join table)
  const ownBrandNamesPromise = prisma.projectBrand
    .findMany({
      where: { projectId: result.ctx.projectId },
      include: { brand: true },
    })
    .then((associations) =>
      new Set(
        associations
          .filter((a) => a.brand && !a.brand.deletedAt && !a.brand.isCompetitor)
          .map((a) => a.brand.name),
      ),
    )
    .catch(() => new Set<string>());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    // Try GET first, fallback to POST (generate) if no report exists
    let res = await fetch(result.ctx.upstreamUrl(`/api/audits/${id}/report`), {
      headers: result.ctx.headers,
      signal: controller.signal,
    });

    if (res.status === 404) {
      res = await fetch(result.ctx.upstreamUrl(`/api/audits/${id}/report`), {
        method: 'POST',
        headers: result.ctx.headers,
        signal: controller.signal,
      });
    }

    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${res.status}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const report = await res.json();

    // Fetch query results for brand/prompt details
    const [results, ownBrandNames] = await Promise.all([
      fetch(result.ctx.upstreamUrl(`/api/audits/${id}/results`), {
        headers: result.ctx.headers,
        signal: AbortSignal.timeout(15_000),
      }).then((r) => (r.ok ? r.json() : [])),
      ownBrandNamesPromise,
    ]);

    const mapped = mapReport(report, Array.isArray(results) ? results : [], ownBrandNames);
    return NextResponse.json(mapped);
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Failed to fetch report' }, { status: 502 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const { id } = await params;
  const upstream = await fetchUpstream(result.ctx, `/api/audits/${id}/report`, {
    method: 'POST',
    timeoutMs: 30_000,
    errorMessage: 'Failed to generate report',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}

type QueryResult = Record<string, unknown>;

/** Map upstream ReportOut + QueryResult[] → frontend ReportData */
function mapReport(report: Record<string, unknown>, results: QueryResult[], ownBrandNames: Set<string>) {
  const platformScores = (report.platform_scores as Record<string, number>) || {};
  const platforms = Object.entries(platformScores).map(([platform, score]) => ({
    platform,
    score: Math.round(score * 10) / 10,
  }));

  const rawInsights = (report.insights as string[]) || [];
  const insights = rawInsights.map((text, i) => ({
    id: String(i),
    type: text.includes('最佳') || text.includes('优势') ? 'strength'
      : text.includes('需要') || text.includes('改进') || text.includes('较低') ? 'weakness'
      : 'opportunity' as const,
    text,
    priority: text.includes('需要') || text.includes('较低') ? 'high' as const : 'medium' as const,
  }));

  const brandMap = new Map<string, { count: number; mentioned: number; confidence: number }>();
  for (const r of results) {
    const brand = (r.brand_name as string) || '未知';
    const existing = brandMap.get(brand) || { count: 0, mentioned: 0, confidence: 0 };
    existing.count++;
    if (r.mention_found) existing.mentioned++;
    if (r.mention_confidence) existing.confidence += r.mention_confidence as number;
    brandMap.set(brand, existing);
  }
  const brands = [...brandMap.entries()].map(([brand, stats]) => ({
    brand,
    mention_count: stats.mentioned,
    visibility_score: Math.round((stats.mentioned / stats.count) * 100),
    is_own: ownBrandNames.has(brand),
  }));

  return {
    audit_id: report.audit_id,
    overall_score: report.overall_score,
    score_label: (report.overall_score as number) >= 70 ? '优秀' : (report.overall_score as number) >= 40 ? '良好' : '待优化',
    mention_rate: report.mention_rate,
    competitor_rank: report.competitor_rank,
    platforms,
    insights,
    brands,
    prompts: results.slice(0, 50).map((r) => ({
      platform: r.platform,
      prompt: r.prompt_text,
      brand: r.brand_name,
      mentioned: r.mention_found,
      confidence: r.mention_confidence,
      recommended: r.is_recommended,
      rank: r.recommendation_rank,
    })),
  };
}
