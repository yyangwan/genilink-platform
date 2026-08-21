import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { prisma } from '@/lib/db';
import { generateContent } from '@/lib/content/service';
import {
  assertMonthlyUsageQuota,
  PlanLimitError,
  planLimitResponse,
  recordMonthlyUsage,
} from '@/lib/billing/usage';

async function loadProjectGenerationContext(projectId: string, workspaceId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      workspaceId,
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
    return null;
  }

  return {
    project_id: projectId,
    project_name: project.name || '',
    project_url: project.url || '',
    industry: project.industry || '',
    product_category: project.industry || '',
    product_name: project.productName || project.name || '',
    product_keywords: project.productKeywords || [],
    product_description: project.productDescription || '',
    product_url: project.productUrl || '',
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    const { projectId, ...payload } = await req.json();
    const projectContext = await loadProjectGenerationContext(ctx.projectId, ctx.workspaceId);
    if (!projectContext) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    try {
      await assertMonthlyUsageQuota(ctx.userId, ctx.workspaceId, 'content_generation');
    } catch (err) {
      if (err instanceof PlanLimitError) return planLimitResponse(err);
      throw err;
    }

    const response = await generateContent(ctx, id, { ...payload, ...projectContext });
    if (response.ok) {
      await recordMonthlyUsage(ctx.userId, ctx.workspaceId, 'content_generation', 1, {
        projectId: ctx.projectId,
        contentId: id,
      });
    }

    return response;
  }, { action: 'write' })(req);
}
