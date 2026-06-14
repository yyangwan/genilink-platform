import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { getDatePartsInTimeZone } from '@/lib/time';

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const upstream = await fetchUpstream(result.ctx, `/api/trends/${result.ctx.projectId}`, {
    errorMessage: 'Failed to fetch trends',
  });
  if ('response' in upstream) return upstream.response;

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

type BeijingDateParts = {
  year: number;
  month: number;
  day: number;
};

function toBeijingDateParts(date: string): BeijingDateParts | null {
  const parts = getDatePartsInTimeZone(date);
  if (!parts) return null;
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

function getIsoWeekKey(parts: BeijingDateParts): string {
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** Group daily data points into weekly or monthly buckets using Asia/Shanghai dates. */
function aggregateByPeriod(points: RawPoint[], period: 'daily' | 'weekly' | 'monthly'): RawPoint[] {
  if (period === 'daily' || points.length === 0) return points;

  const enriched = points
    .map((point) => ({
      ...point,
      beijingParts: toBeijingDateParts(point.date),
    }))
    .filter((point) => Boolean(point.beijingParts));

  if (enriched.length === 0) return points;

  const sorted = [...enriched].sort((a, b) => a.date.localeCompare(b.date));

  const groups = new Map<string, RawPoint[]>();
  for (const p of sorted) {
    const parts = p.beijingParts!;
    const key = period === 'weekly'
      ? getIsoWeekKey(parts)
      : `${parts.year}-${String(parts.month).padStart(2, '0')}`;
    const existing = groups.get(key) || [];
    existing.push({
      date: p.date,
      overall_score: p.overall_score,
      platform_scores: p.platform_scores,
    });
    groups.set(key, existing);
  }

  return [...groups.values()].map((pts) => {
    const n = pts.length;
    const overall_score = pts.reduce((sum, point) => sum + point.overall_score, 0) / n;

    const platformSums = new Map<string, { sum: number; count: number }>();
    for (const point of pts) {
      for (const [platform, score] of Object.entries(point.platform_scores)) {
        const existing = platformSums.get(platform) || { sum: 0, count: 0 };
        existing.sum += score;
        existing.count += 1;
        platformSums.set(platform, existing);
      }
    }

    const platform_scores: Record<string, number> = {};
    for (const [platform, { sum, count }] of platformSums) {
      platform_scores[platform] = sum / count;
    }

    return {
      date: pts[n - 1].date,
      overall_score,
      platform_scores,
    };
  });
}
