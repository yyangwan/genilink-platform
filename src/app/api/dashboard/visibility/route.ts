import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth/get-workspace';

const VISIBILITY_URL = process.env.VISIBILITY_SERVICE_URL || 'http://127.0.0.1:8000';

const EMPTY = {
  overallScore: null as number | null,
  mentionCount: 0,
  platformCoverage: [] as { name: string; score: number }[],
  competitorRank: null as number | null,
  suggestions: [] as { priority: string; text: string }[],
  latestAuditDate: null as string | null,
};

function makeHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const serviceToken = process.env.SERVICE_TOKEN;
  if (serviceToken) headers['Authorization'] = `Bearer ${serviceToken}`;
  return headers;
}

// GET /api/dashboard/visibility — fetch real visibility data from 智見
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) return NextResponse.json(EMPTY);

  const projectId = req.nextUrl.searchParams.get('project');

  const projects = await prisma.project.findMany({
    where: projectId ? { id: projectId, workspaceId } : { workspaceId },
    include: { externalMappings: true },
    take: 1,
  });

  if (projects.length === 0) return NextResponse.json(EMPTY);

  const project = projects[0];
  const visibilityMapping = project.externalMappings.find((m) => m.service === 'visibility');
  if (!visibilityMapping) return NextResponse.json(EMPTY);

  const externalId = visibilityMapping.externalId;
  const projectPk = parseInt(externalId, 10);
  if (isNaN(projectPk)) return NextResponse.json(EMPTY);

  const headers = makeHeaders();

  try {
    const [positioningRes, auditsRes, suggestionsRes, platformsRes] = await Promise.allSettled([
      fetch(`${VISIBILITY_URL}/api/strategic/projects/${projectPk}/competitor-positioning`, { headers, signal: AbortSignal.timeout(15_000) }),
      fetch(`${VISIBILITY_URL}/api/trends/${projectPk}/audits-history`, { headers, signal: AbortSignal.timeout(15_000) }),
      fetch(`${VISIBILITY_URL}/api/suggestions/${projectPk}`, { headers, signal: AbortSignal.timeout(15_000) }),
      fetch(`${VISIBILITY_URL}/api/platforms`, { headers, signal: AbortSignal.timeout(15_000) }),
    ]);

    // ── Competitor positioning → mentionCount, overallScore, competitorRank ──
    let mentionCount = 0;
    let overallScore: number | null = null;
    let competitorRank: number | null = null;
    const ownBrandNames = new Set<string>();

    if (positioningRes.status === 'fulfilled' && positioningRes.value.ok) {
      const positioning = await positioningRes.value.json();
      const brands = positioning.brands as Array<{
        name: string;
        mention_count?: number;
        mention_frequency?: number;
        is_competitor?: boolean;
      }>;

      const ownBrands = brands.filter((b) => !b.is_competitor);
      for (const b of ownBrands) ownBrandNames.add(b.name);

      for (const brand of ownBrands) {
        mentionCount += brand.mention_count ?? 0;
      }

      if (ownBrands.length > 0) {
        const avgFreq = ownBrands.reduce((s, b) => s + (b.mention_frequency ?? 0), 0) / ownBrands.length;
        overallScore = Math.round(avgFreq * 100);
      }

      // Compute rank: sort all brands by mention_frequency desc, find own brand's position
      if (brands.length > 1) {
        const sorted = [...brands].sort((a, b) => (b.mention_frequency ?? 0) - (a.mention_frequency ?? 0));
        const ownBest = ownBrands.reduce((best, b) =>
          (b.mention_frequency ?? 0) > (best.mention_frequency ?? 0) ? b : best
        , ownBrands[0]);
        const rank = sorted.findIndex((b) => b.name === ownBest.name) + 1;
        if (rank > 0) competitorRank = rank;
      }
    }

    // ── Audit history → latestAuditDate + fetch latest results for platform scores ──
    let latestAuditDate: string | null = null;
    let latestAuditId: number | null = null;

    if (auditsRes.status === 'fulfilled' && auditsRes.value.ok) {
      const audits = await auditsRes.value.json();
      if (Array.isArray(audits) && audits.length > 0) {
        const latest = audits[0];
        latestAuditDate = latest.created_at ?? null;
        if (latest.status === 'completed' || latest.status === 'partial') {
          latestAuditId = latest.id;
        }
      }
    }

    // ── Platform coverage: compute from latest audit results ──
    const platformCoverage: { name: string; score: number }[] = [];

    // Build platform label map
    const platformLabels: Record<string, string> = {};
    if (platformsRes.status === 'fulfilled' && platformsRes.value.ok) {
      const platforms = await platformsRes.value.json();
      if (Array.isArray(platforms)) {
        for (const p of platforms) {
          platformLabels[p.key] = p.label ?? p.key;
        }
      }
    }

    if (latestAuditId) {
      const resultsRes = await fetch(`${VISIBILITY_URL}/api/audits/${latestAuditId}/results`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });

      if (resultsRes.ok) {
        const results = await resultsRes.json() as Array<{
          platform: string;
          brand_name: string;
          mention_found: boolean;
          mention_confidence: number | null;
          is_recommended: boolean;
          recommendation_rank: number | null;
          error: string | null;
        }>;

        // Only count own brands, group by platform
        const platformStats: Record<string, { total: number; found: number; confidenceSum: number }> = {};
        for (const r of results) {
          // Skip competitor brands and error rows
          if (ownBrandNames.size > 0 && !ownBrandNames.has(r.brand_name)) continue;
          if (r.error) continue;

          if (!platformStats[r.platform]) {
            platformStats[r.platform] = { total: 0, found: 0, confidenceSum: 0 };
          }
          platformStats[r.platform].total++;
          if (r.mention_found) {
            platformStats[r.platform].found++;
            platformStats[r.platform].confidenceSum += r.mention_confidence ?? 0.5;
          }
        }

        for (const [key, stats] of Object.entries(platformStats)) {
          // Score = mention_rate × avg_confidence (normalized 0-100)
          const mentionRate = stats.total > 0 ? stats.found / stats.total : 0;
          const avgConfidence = stats.found > 0 ? stats.confidenceSum / stats.found : 0;
          const score = Math.round(mentionRate * avgConfidence * 100);
          platformCoverage.push({
            name: platformLabels[key] ?? key,
            score,
          });
        }
      }
    }

    // Fallback: if no results, show platforms with 0 score
    if (platformCoverage.length === 0) {
      for (const [key, label] of Object.entries(platformLabels)) {
        platformCoverage.push({ name: label, score: 0 });
      }
    }

    // ── Suggestions ──
    let suggestions: Array<{ priority: string; text: string }> = [];
    if (suggestionsRes.status === 'fulfilled' && suggestionsRes.value.ok) {
      const raw = await suggestionsRes.value.json();
      if (Array.isArray(raw)) {
        suggestions = raw.slice(0, 5).map((s: { priority?: string; text?: string; title?: string; type?: string }) => ({
          priority: s.priority ?? s.type ?? 'medium',
          text: s.text ?? s.title ?? '',
        }));
      }
    }

    return NextResponse.json({
      overallScore,
      mentionCount,
      platformCoverage,
      competitorRank,
      suggestions,
      latestAuditDate,
    });
  } catch {
    return NextResponse.json(EMPTY);
  }
}
