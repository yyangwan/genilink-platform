import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const auditId = req.nextUrl.searchParams.get('auditId');
  const qs = auditId ? `?audit_id=${auditId}` : '';

  const upstream = await fetchUpstream(
    result.ctx,
    `/api/analysis/projects/${result.ctx.projectId}/content-intelligence${qs}`,
    { errorMessage: 'Failed to fetch content intelligence' },
  );
  if ('response' in upstream) return upstream.response;

  // Map upstream ContentIntelligenceOut → frontend ContentIntelligence
  const data = upstream.data as Record<string, unknown>;
  const mapped = {
    sentiment: {
      positive: (data.sentiment_breakdown as Record<string, number>)?.positive || 0,
      neutral: (data.sentiment_breakdown as Record<string, number>)?.neutral || 0,
      negative: (data.sentiment_breakdown as Record<string, number>)?.negative || 0,
    },
    topics: Object.entries(data.topic_distribution as Record<string, number> || {}).map(([topic, count]) => ({
      topic,
      count,
      sentiment: 0.5, // upstream doesn't provide per-topic sentiment
    })),
    sources: ((data.top_cited_sources || []) as Record<string, unknown>[]).map((s) => ({
      source: s.domain as string,
      domain: s.domain as string,
      mention_count: s.total_count as number,
      authority_score: Math.round((s.authority_avg as number) * 20), // normalize 0-5 → 0-100
    })),
    answerStructure: Object.entries(data.answer_structure_distribution as Record<string, number> || {}).map(([type, count]) => {
      const total = Object.values<number>(data.answer_structure_distribution as Record<string, number> || {}).reduce((a, b) => a + b, 0);
      return {
        type,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      };
    }),
  };
  return NextResponse.json(mapped);
}
