import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

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

  const cookieStore = await cookies();
  const workspaceId = cookieStore.get('genilink-workspace')?.value;
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

    let mentionCount = 0;
    let overallScore: number | null = null;
    const platformCoverage: { name: string; score: number }[] = [];

    if (positioningRes.status === 'fulfilled' && positioningRes.value.ok) {
      const positioning = await positioningRes.value.json();
      const brands = positioning.brands as Array<{ mention_count?: number; mention_frequency?: number; is_competitor?: boolean }>;
      for (const brand of brands) {
        if (!brand.is_competitor) {
          mentionCount += brand.mention_count ?? 0;
        }
      }
      const ownBrands = brands.filter((b) => !b.is_competitor);
      if (ownBrands.length > 0) {
        const avgFreq = ownBrands.reduce((s, b) => s + (b.mention_frequency ?? 0), 0) / ownBrands.length;
        overallScore = Math.round(avgFreq * 100);
      }
    }

    let latestAuditDate: string | null = null;
    if (auditsRes.status === 'fulfilled' && auditsRes.value.ok) {
      const audits = await auditsRes.value.json();
      if (Array.isArray(audits) && audits.length > 0) {
        latestAuditDate = audits[0].created_at ?? null;
      }
    }

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

    if (platformsRes.status === 'fulfilled' && platformsRes.value.ok) {
      const platforms = await platformsRes.value.json();
      if (Array.isArray(platforms)) {
        for (const p of platforms) {
          platformCoverage.push({ name: p.label ?? p.key, score: 0 });
        }
      }
    }

    return NextResponse.json({
      overallScore,
      mentionCount,
      platformCoverage,
      competitorRank: null,
      suggestions,
      latestAuditDate,
    });
  } catch {
    return NextResponse.json(EMPTY);
  }
}
