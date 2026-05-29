import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const upstream = await fetchUpstream(result.ctx, `/api/trends/${result.ctx.externalId}`, {
    errorMessage: 'Failed to fetch trends',
  });
  if ('response' in upstream) return upstream.response;

  // Map upstream trends → frontend TrendsResponse
  const rawPoints = Array.isArray((upstream.data as Record<string, unknown>)?.data)
    ? ((upstream.data as Record<string, unknown>).data as Record<string, unknown>[])
    : [];
  const period = req.nextUrl.searchParams.get('period') || 'weekly';

  type RawPoint = { date: string; overall_score: number; platform_scores: Record<string, number> };
  const daily: RawPoint[] = rawPoints.map((point) => ({
    date: point.date as string,
    overall_score: point.overall_score as number,
    platform_scores: (point.platform_scores as Record<string, number>) || {},
  }));

  const aggregated = aggregateByPeriod(daily, period as 'daily' | 'weekly' | 'monthly');

  const trends = aggregated.map((point) => ({
    period: point.date,
    overall_score: Math.round(point.overall_score * 10) / 10,
    platforms: Object.entries(point.platform_scores).map(
      ([platform, score]) => ({ platform, score: Math.round(score * 10) / 10 }),
    ),
  }));
  return NextResponse.json({ trends });
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
