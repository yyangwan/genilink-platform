import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { getAuditStatus, isAuditFinished } from '@/lib/audit-status';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { getWorkspaceRole } from '@/lib/auth/workspace';
import { issueVisibilityProjectJWT } from '@/lib/auth/service-jwt';

const VISIBILITY_URL = process.env.VISIBILITY_SERVICE_URL || 'http://127.0.0.1:8000';
const PLATFORM_LABELS: Record<string, string> = {
  deepseek: 'DeepSeek',
  qwen: '通义千问',
  doubao: '豆包',
  kimi: 'Kimi',
  hunyuan: '腾讯元宝',
};

const EMPTY = {
  overallScore: null as number | null,
  mentionCount: 0,
  platformCoverage: [] as { name: string; score: number }[],
  competitorRank: null as number | null,
  suggestions: [] as { priority: string; text: string }[],
  latestAuditDate: null as string | null,
  trend: [] as { date: string; score: number }[],
};

// GET /api/dashboard/visibility — fetch real visibility data from 智見
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) return NextResponse.json(EMPTY);

  const projectId = req.nextUrl.searchParams.get('project');
  if (!projectId) return NextResponse.json(EMPTY);

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
  });
  if (!project) return NextResponse.json(EMPTY);

  const role = await getWorkspaceRole(session.user.id, workspaceId);
  if (!role) return NextResponse.json(EMPTY);
  const serviceToken = await issueVisibilityProjectJWT({
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    workspaceId,
    projectId: project.id,
    role,
  });
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${serviceToken}`,
  };

  try {
    const [positioningRes, auditsRes, platformsRes] = await Promise.allSettled([
      fetch(`${VISIBILITY_URL}/api/strategic/projects/${project.id}/competitor-positioning`, { headers, signal: AbortSignal.timeout(15_000) }),
      fetch(`${VISIBILITY_URL}/api/trends/${project.id}/audits-history`, { headers, signal: AbortSignal.timeout(15_000) }),
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
    let latestAuditPlatforms: string[] = [];
    let trend: Array<{ date: string; score: number }> = [];

    if (auditsRes.status === 'fulfilled' && auditsRes.value.ok) {
      const audits = await auditsRes.value.json();
      if (Array.isArray(audits) && audits.length > 0) {
        trend = audits
          .map((audit: { created_at?: string | null; completed_at?: string | null; started_at?: string | null; overall_score?: number | null; score?: number | null }) => {
            const score = audit.overall_score ?? audit.score;
            const date = audit.completed_at ?? audit.created_at ?? audit.started_at;
            return typeof score === 'number' && Number.isFinite(score) && date
              ? { date, score: Math.round(score) }
              : null;
          })
          .filter((point): point is { date: string; score: number } => Boolean(point))
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-8);

        const latest = audits[0];
        latestAuditDate = latest.created_at ?? null;
        latestAuditPlatforms = Array.isArray(latest.platforms) ? latest.platforms : [];
        const status = getAuditStatus(latest);
        if (isAuditFinished(status)) {
          latestAuditId = latest.id;
        }
      }
    }

    // ── Platform coverage: compute from latest audit results ──
    const platformCoverageByKey: Record<string, { name: string; score: number }> = {};

    // Build platform label map
    const platformLabels: Record<string, string> = { ...PLATFORM_LABELS };
    if (platformsRes.status === 'fulfilled' && platformsRes.value.ok) {
      const platforms = await platformsRes.value.json();
      if (Array.isArray(platforms)) {
        for (const p of platforms) {
          platformLabels[p.key] = p.label ?? p.key;
        }
      }
    }

    for (const key of latestAuditPlatforms) {
      platformCoverageByKey[key] = { name: platformLabels[key] ?? key, score: 0 };
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
          platformCoverageByKey[key] = {
            name: platformLabels[key] ?? key,
            score,
          };
        }
      }
    }

    // Fallback: if no results, show platforms with 0 score
    if (Object.keys(platformCoverageByKey).length === 0) {
      for (const [key, label] of Object.entries(platformLabels)) {
        platformCoverageByKey[key] = { name: label, score: 0 };
      }
    }
    const platformOrder = latestAuditPlatforms.length > 0
      ? latestAuditPlatforms
      : Object.keys(platformCoverageByKey);
    const platformCoverage = platformOrder
      .filter((key) => platformCoverageByKey[key])
      .map((key) => platformCoverageByKey[key]);

    if (trend.length === 0 && latestAuditDate && overallScore !== null) {
      trend = [{ date: latestAuditDate, score: overallScore }];
    }

    // ── Suggestions ──
    let suggestions: Array<{ priority: string; text: string }> = [];
    const suggestionsUrl = latestAuditId
      ? `${VISIBILITY_URL}/api/suggestions/${project.id}?audit_id=${latestAuditId}`
      : `${VISIBILITY_URL}/api/suggestions/${project.id}`;
    const suggestionsRes = await fetch(suggestionsUrl, { headers, signal: AbortSignal.timeout(15_000) });
    if (suggestionsRes.ok) {
      const raw = await suggestionsRes.json();
      if (Array.isArray(raw)) {
        suggestions = raw.slice(0, 5).map((s: { priority?: string; text?: string; title?: string; type?: string; description?: string; detail?: { evidence_summary?: string } }) => ({
          priority: s.priority ?? s.type ?? 'medium',
          text: s.text ?? s.title ?? s.detail?.evidence_summary ?? s.description ?? '',
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
      trend,
    });
  } catch {
    return NextResponse.json(EMPTY);
  }
}
