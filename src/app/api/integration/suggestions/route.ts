import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req, { sync: true });
  if (!result.ok) return result.response;

  const upstream = await fetchUpstream(result.ctx, `/api/suggestions/${result.ctx.projectPk}`, {
    errorMessage: 'Failed to fetch suggestions',
  });
  if ('response' in upstream) return upstream.response;

  const mapped = (Array.isArray(upstream.data) ? upstream.data : []).map(mapSuggestion);
  return NextResponse.json(mapped);
}

export async function POST(req: NextRequest) {
  const result = await resolveGuard(req, { sync: true });
  if (!result.ok) return result.response;

  const upstream = await fetchUpstream(result.ctx, `/api/suggestions/${result.ctx.projectPk}/generate`, {
    method: 'POST',
    timeoutMs: 60_000,
    errorMessage: 'Failed to generate suggestions',
  });
  if ('response' in upstream) return upstream.response;

  const mapped = (Array.isArray(upstream.data) ? upstream.data : []).map(mapSuggestion);
  return NextResponse.json(mapped);
}

/** Map upstream SuggestionOut → frontend Suggestion */
function mapSuggestion(s: Record<string, unknown>) {
  const detail = (s.detail as Record<string, unknown>) ?? {};
  return {
    id: String(s.id),
    text: (s.title as string) || (s.description as string) || '',
    category: (s.category as string) || '',
    platform: (detail.platform as string) || '',
    priority: (s.priority as string) || 'medium',
    status: s.is_resolved ? 'resolved' : 'pending',
    action_channels: (detail.action_channels as string[]) || [],
    type_tags: (detail.type_tags as string[]) || [],
    keywords: (detail.keywords as string[]) || [],
    content_outline: (detail.content_outline as string) || '',
    weekly_tasks: (detail.weekly_tasks as { week: string; tasks: string[] }[]) || [],
    competitor_reference: (detail.competitor_reference as string) || '',
    expected_result: (detail.expected_result as string) || '',
  };
}
