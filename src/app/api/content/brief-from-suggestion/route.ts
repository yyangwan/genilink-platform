import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { prisma } from '@/lib/db';
import { generateContentBriefFromSuggestion } from '@/lib/content/brief-generator';
import type { SuggestionForContentBrief } from '@/lib/content/content-brief';

export async function POST(req: NextRequest) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const body = await req.json().catch(() => ({}));
    const suggestion = body.suggestion as SuggestionForContentBrief | undefined;

    if (!suggestion?.text) {
      return NextResponse.json({ error: 'Missing suggestion' }, { status: 400 });
    }

    const project = await prisma.project.findFirst({
      where: {
        id: ctx.projectId,
        workspaceId: ctx.workspaceId,
      },
      select: {
        id: true,
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

    const brief = await generateContentBriefFromSuggestion(project, suggestion);
    return NextResponse.json({ data: brief });
  }, { action: 'write' })(req);
}
