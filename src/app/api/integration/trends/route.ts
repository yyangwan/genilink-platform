import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { requireBilling, BillingError } from '@/lib/billing/guard';
import { getExternalId } from '@/lib/proxy/zhijian-client';
import { verifyProjectInWorkspace } from '@/lib/auth/workspace';
import { getWorkspaceId } from '@/lib/auth/get-workspace';

const VISIBILITY_URL = process.env.VISIBILITY_SERVICE_URL || 'http://127.0.0.1:8000';

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

  const externalId = await getExternalId(projectId, 'visibility');
  if (!externalId) {
    return NextResponse.json({ error: 'No external mapping for project' }, { status: 404 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const serviceToken = process.env.SERVICE_TOKEN;
    if (serviceToken) headers['Authorization'] = `Bearer ${serviceToken}`;

    const res = await fetch(`${VISIBILITY_URL}/api/trends/${externalId}`, {
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

    // Map upstream trends → frontend TrendsResponse
    const rawPoints = Array.isArray(data?.data) ? data.data : [];
    const period = req.nextUrl.searchParams.get('period') || 'weekly';

    type RawPoint = { date: string; overall_score: number; platform_scores: Record<string, number> };
    const daily: RawPoint[] = rawPoints.map((point: Record<string, unknown>) => ({
      date: point.date as string,
      overall_score: point.overall_score as number,
      platform_scores: (point.platform_scores as Record<string, number>) || {},
    }));

    // Aggregate by period
    const aggregated = aggregateByPeriod(daily, period as 'daily' | 'weekly' | 'monthly');

    const trends = aggregated.map((point) => ({
      period: point.date,
      overall_score: Math.round(point.overall_score * 10) / 10,
      platforms: Object.entries(point.platform_scores).map(
        ([platform, score]) => ({ platform, score: Math.round(score * 10) / 10 }),
      ),
    }));
    return NextResponse.json({ trends });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Failed to fetch trends' }, { status: 502 });
  }
}

type RawPoint = { date: string; overall_score: number; platform_scores: Record<string, number> };

/** Group daily data points into weekly or monthly buckets, averaging scores */
function aggregateByPeriod(points: RawPoint[], period: 'daily' | 'weekly' | 'monthly'): RawPoint[] {
  if (period === 'daily' || points.length === 0) return points;

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));

  // Build groups keyed by bucket label
  const groups = new Map<string, RawPoint[]>();
  for (const p of sorted) {
    const d = new Date(p.date);
    let key: string;
    if (period === 'weekly') {
      // ISO week: "YYYY-WNN"
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      key = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    const existing = groups.get(key) || [];
    existing.push(p);
    groups.set(key, existing);
  }

  // Average each group
  return [...groups.entries()].map(([key, pts]) => {
    const n = pts.length;
    const overall_score = pts.reduce((s, p) => s + p.overall_score, 0) / n;

    // Average per-platform scores
    const platformSums = new Map<string, { sum: number; count: number }>();
    for (const p of pts) {
      for (const [platform, score] of Object.entries(p.platform_scores)) {
        const e = platformSums.get(platform) || { sum: 0, count: 0 };
        e.sum += score;
        e.count++;
        platformSums.set(platform, e);
      }
    }
    const platform_scores: Record<string, number> = {};
    for (const [platform, { sum, count }] of platformSums) {
      platform_scores[platform] = sum / count;
    }

    // Use the last date in the bucket as the display date
    return { date: pts[n - 1].date, overall_score, platform_scores };
  });
}