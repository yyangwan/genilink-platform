import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { prisma } from '@/lib/db';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { generateGenieContent, getGenieGenerations } from '@/lib/content/service';
import { normalizeGenieGenerationResult, unwrapGenieGenerations } from '@/lib/content/contract-adapters';

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

export async function POST(req: NextRequest) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { projectId, ...payload } = await req.json();
    const projectContext = await loadProjectGenerationContext(ctx.projectId, ctx.workspaceId);
    if (!projectContext) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const result = await generateGenieContent(ctx, { ...payload, ...projectContext });
    return NextResponse.json({ data: normalizeGenieGenerationResult(result) });
  }, { action: 'write' })(req);
}

export async function GET(req: NextRequest) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    try {
      return NextResponse.json({ data: unwrapGenieGenerations(await getGenieGenerations(ctx)) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'read' })(req);
}
