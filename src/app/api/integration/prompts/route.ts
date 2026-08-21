import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { getWorkspaceBillingAccess } from '@/lib/billing/access';
import { DEFAULT_PROMPT_CATEGORY, isPromptCategory } from '@/lib/prompts/prompt-options';

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

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'Prompt text is required' }, { status: 400 });
  }

  const category = body.category || DEFAULT_PROMPT_CATEGORY;
  if (!isPromptCategory(category)) {
    return NextResponse.json({ error: 'Invalid prompt category' }, { status: 400 });
  }

  const access = await getWorkspaceBillingAccess(result.ctx.session.user.id, result.ctx.workspaceId);
  const existing = await fetchUpstream(result.ctx, `/api/prompts?project_id=${result.ctx.projectId}`, {
    errorMessage: 'Failed to fetch prompts',
  });
  if ('response' in existing) return existing.response;

  const existingPrompts = Array.isArray(existing.data) ? existing.data : [];
  if (existingPrompts.length >= access.limits.promptsPerProject) {
    return NextResponse.json(
      {
        error: 'PLAN_LIMIT_EXCEEDED',
        feature: 'prompts_per_project',
        used: existingPrompts.length,
        limit: access.limits.promptsPerProject,
      },
      { status: 402 },
    );
  }

  const upstream = await fetchUpstream(result.ctx, `/api/prompts?project_id=${result.ctx.projectId}`, {
    method: 'POST',
    body: {
      project_id: result.ctx.projectId,
      text,
      category,
      is_auto_generated: false,
    },
    timeoutMs: 30_000,
    errorMessage: 'Failed to create prompt',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
