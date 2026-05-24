import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { requireBilling, BillingError } from '@/lib/billing/guard';
import { getExternalId } from '@/lib/proxy/zhijian-client';
import { verifyProjectInWorkspace } from '@/lib/auth/workspace';
import { getWorkspaceId } from '@/lib/auth/get-workspace';

const VISIBILITY_URL = process.env.VISIBILITY_SERVICE_URL || 'http://127.0.0.1:8000';

async function resolveProjectPk(projectId: string): Promise<number | null> {
  const externalId = await getExternalId(projectId, 'visibility');
  if (!externalId) return null;

  const parsed = parseInt(externalId, 10);
  if (!isNaN(parsed) && String(parsed) === externalId) return parsed;
  return null;
}

function makeHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const serviceToken = process.env.SERVICE_TOKEN;
  if (serviceToken) headers['Authorization'] = `Bearer ${serviceToken}`;
  return headers;
}

export async function GET(req: NextRequest) {
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
    return NextResponse.json({ error: 'Missing projectId query parameter' }, { status: 400 });
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

  const projectPk = await resolveProjectPk(projectId);
  if (!projectPk) {
    return NextResponse.json({ error: 'No external mapping for project' }, { status: 404 });
  }

  const headers = makeHeaders();

  try {
    // Aggregate data from multiple backend endpoints
    const [positioningRes, auditsRes, suggestionsRes, platformsRes] = await Promise.allSettled([
      fetch(`${VISIBILITY_URL}/api/strategic/projects/${projectPk}/competitor-positioning`, { headers, signal: AbortSignal.timeout(15_000) }),
      fetch(`${VISIBILITY_URL}/api/trends/${projectPk}/audits-history`, { headers, signal: AbortSignal.timeout(15_000) }),
      fetch(`${VISIBILITY_URL}/api/suggestions/${projectPk}`, { headers, signal: AbortSignal.timeout(15_000) }),
      fetch(`${VISIBILITY_URL}/api/platforms`, { headers, signal: AbortSignal.timeout(15_000) }),
    ]);

    // Parse positioning data
    let mentionCount = 0;
    let overallScore: number | null = null;
    const platformCoverage: { name: string; score: number }[] = [];

    if (positioningRes.status === 'fulfilled' && positioningRes.value.ok) {
      const positioning = await positioningRes.value.json();
      const brands = positioning.brands as Array<{ mention_count?: number; mention_frequency?: number; is_competitor?: boolean }>;
      // Sum mentions across own brands (non-competitor)
      for (const brand of brands) {
        if (!brand.is_competitor) {
          mentionCount += brand.mention_count ?? 0;
        }
      }
      // Compute a simple score from mention frequency
      const ownBrands = brands.filter((b) => !b.is_competitor);
      if (ownBrands.length > 0) {
        const avgFreq = ownBrands.reduce((s, b) => s + (b.mention_frequency ?? 0), 0) / ownBrands.length;
        overallScore = Math.round(avgFreq * 100);
      }
    }

    // Parse audit history for latest audit date
    let latestAuditDate: string | null = null;
    if (auditsRes.status === 'fulfilled' && auditsRes.value.ok) {
      const audits = await auditsRes.value.json();
      if (Array.isArray(audits) && audits.length > 0) {
        latestAuditDate = audits[0].created_at ?? null;
      }
    }

    // Parse suggestions
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

    // Build platform coverage from platforms list (with zero scores if no audit data)
    if (platformsRes.status === 'fulfilled' && platformsRes.value.ok) {
      const platforms = await platformsRes.value.json();
      if (Array.isArray(platforms)) {
        for (const p of platforms) {
          platformCoverage.push({ name: p.label ?? p.key, score: 0 });
        }
      }
    }

    return NextResponse.json({
      data: {
        overallScore,
        mentionCount,
        platformCoverage,
        competitorRank: null,
        suggestions,
        latestAuditDate,
      },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Failed to fetch visibility data' }, { status: 502 });
  }
}
