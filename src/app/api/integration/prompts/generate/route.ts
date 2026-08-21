import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { getWorkspaceBillingAccess } from '@/lib/billing/access';

export async function POST(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const body = await req.json().catch(() => ({}));
  const { projectId: _pid, ...rest } = body;
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

  const project = await prisma.project.findFirst({
    where: {
      id: result.ctx.projectId,
      workspaceId: result.ctx.workspaceId,
    },
    select: {
      name: true,
      url: true,
      industry: true,
      productName: true,
      productKeywords: true,
      productDescription: true,
      productUrl: true,
    },
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const requestedLimit = typeof rest.limit === 'number' && Number.isFinite(rest.limit)
    ? rest.limit
    : 1;
  const remainingPromptSlots = access.limits.promptsPerProject - existingPrompts.length;

  const upstream = await fetchUpstream(result.ctx, `/api/prompts/generate`, {
    method: 'POST',
    body: {
      ...rest,
      limit: Math.min(requestedLimit, remainingPromptSlots),
      project_id: result.ctx.projectId,
      project_name: project.name || '',
      project_url: project.url || '',
      industry: project.industry || '',
      product_category: project.industry || '',
      product_name: project.productName || project.name || '',
      product_keywords: project.productKeywords || [],
      product_description: project.productDescription || '',
      product_url: project.productUrl || '',
    },
    timeoutMs: 30_000,
    errorMessage: 'Failed to generate prompt',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
