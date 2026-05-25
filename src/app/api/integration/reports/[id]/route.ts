import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { requireBilling, BillingError } from '@/lib/billing/guard';
import { verifyProjectInWorkspace } from '@/lib/auth/workspace';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { getExternalId } from '@/lib/proxy/zhijian-client';

const VISIBILITY_URL = process.env.VISIBILITY_SERVICE_URL || 'http://127.0.0.1:8000';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
  }

  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  // Verify project belongs to this workspace
  const _project = await verifyProjectInWorkspace(projectId, workspaceId);
  if (!_project) {
    return NextResponse.json({ error: 'Project not found in workspace' }, { status: 403 });
  }

  try {
    await requireBilling(session.user.id, workspaceId, 'visibility');
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json({ error: 'NO_SUBSCRIPTION', module: 'visibility' }, { status: 403 });
    }
    throw err;
  }

  const { id } = await params;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const serviceToken = process.env.SERVICE_TOKEN;
    if (serviceToken) headers['Authorization'] = `Bearer ${serviceToken}`;

    // Resolve project's external ID for brands lookup
    const externalId = await getExternalId(projectId, 'visibility');
    const projectPk = externalId ? parseInt(externalId, 10) : null;

    // Fetch own brand names in parallel with report
    const ownBrandNamesPromise = projectPk && !isNaN(projectPk)
      ? fetch(`${VISIBILITY_URL}/api/projects/${projectPk}/brands`, { headers, signal: AbortSignal.timeout(10_000) })
          .then(async (r) => {
            if (!r.ok) return new Set<string>();
            const brands = await r.json();
            if (!Array.isArray(brands)) return new Set<string>();
            return new Set(
              brands
                .filter((b: { is_competitor?: boolean; name: string }) => !b.is_competitor)
                .map((b: { name: string }) => b.name),
            );
          })
          .catch(() => new Set<string>())
      : Promise.resolve(new Set<string>());

    // Try GET first, fallback to POST (generate) if no report exists
    let res = await fetch(`${VISIBILITY_URL}/api/audits/${id}/report`, {
      headers,
      signal: controller.signal,
    });

    if (res.status === 404) {
      // No report yet — generate one
      res = await fetch(`${VISIBILITY_URL}/api/audits/${id}/report`, {
        method: 'POST',
        headers,
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
      fetch(`${VISIBILITY_URL}/api/audits/${id}/results`, {
        headers,
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
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
  }

  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  // Verify project belongs to this workspace
  const _project = await verifyProjectInWorkspace(projectId, workspaceId);
  if (!_project) {
    return NextResponse.json({ error: 'Project not found in workspace' }, { status: 403 });
  }

  try {
    await requireBilling(session.user.id, workspaceId, 'visibility');
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json({ error: 'NO_SUBSCRIPTION', module: 'visibility' }, { status: 403 });
    }
    throw err;
  }

  const { id } = await params;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const serviceToken = process.env.SERVICE_TOKEN;
    if (serviceToken) headers['Authorization'] = `Bearer ${serviceToken}`;

    const res = await fetch(`${VISIBILITY_URL}/api/audits/${id}/report`, {
      method: 'POST',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${res.status}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 502 });
  }
}

type QueryResult = Record<string, unknown>;

/** Map upstream ReportOut + QueryResult[] → frontend ReportData */
function mapReport(report: Record<string, unknown>, results: QueryResult[], ownBrandNames: Set<string>) {
  // platform_scores: { kimi: 25.7, ... } → platforms: [{ platform, score }]
  const platformScores = (report.platform_scores as Record<string, number>) || {};
  const platforms = Object.entries(platformScores).map(([platform, score]) => ({
    platform,
    score: Math.round(score * 10) / 10,
  }));

  // insights: string[] → insights: [{ id, type, text, priority }]
  const rawInsights = (report.insights as string[]) || [];
  const insights = rawInsights.map((text, i) => ({
    id: String(i),
    type: text.includes('最佳') || text.includes('优势') ? 'strength'
      : text.includes('需要') || text.includes('改进') || text.includes('较低') ? 'weakness'
      : 'opportunity' as const,
    text,
    priority: text.includes('需要') || text.includes('较低') ? 'high' as const : 'medium' as const,
  }));

  // Aggregate brand mentions from query results
  const brandMap = new Map<string, { count: number; mentioned: number; confidence: number }>();
  for (const r of results) {
    const brand = (r.brand_name as string) || '未知';
    const existing = brandMap.get(brand) || { count: 0, mentioned: 0, confidence: 0 };
    existing.count++;
    if (r.mention_found) existing.mentioned++;
    if (r.mention_confidence) existing.confidence += r.mention_confidence as number;
    brandMap.set(brand, existing);
  }
  const maxCount = Math.max(...[...brandMap.values()].map((b) => b.count), 1);
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
