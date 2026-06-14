import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

type PromptRecord = Record<string, unknown> & {
  id?: string | number;
  prompt_id?: string | number;
  promptId?: string | number;
};

function normalizePromptId(record: unknown): unknown {
  if (!record || typeof record !== 'object') return record;

  const prompt = record as PromptRecord;
  const rawId = prompt.id ?? prompt.prompt_id ?? prompt.promptId;
  if (rawId == null) return record;

  return { ...prompt, id: String(rawId) };
}

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const upstream = await fetchUpstream(result.ctx, `/api/prompts?project_id=${result.ctx.projectId}`, {
    errorMessage: 'Failed to fetch prompts',
  });
  if ('response' in upstream) return upstream.response;

  if (Array.isArray(upstream.data)) {
    return NextResponse.json(upstream.data.map(normalizePromptId));
  }

  return NextResponse.json(upstream.data);
}

export async function POST(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  // Body was parsed by resolveGuard to get projectId — re-read remaining fields
  const body = await req.json().catch(() => ({}));
  const { projectId: _pid, ...rest } = body;

  const upstream = await fetchUpstream(result.ctx, `/api/prompts?project_id=${result.ctx.projectId}`, {
    method: 'POST',
    body: rest,
    timeoutMs: 30_000,
    errorMessage: 'Failed to create prompt',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
