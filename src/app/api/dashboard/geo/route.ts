import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { proxyRequest } from '@/lib/proxy/zhijian-client';
import { getWorkspaceRole } from '@/lib/auth/workspace';
import { issueVisibilityProjectJWT } from '@/lib/auth/service-jwt';

// GET /api/dashboard/geo — fetch real geo data from 智見
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceId(session.user.id);

  if (!workspaceId) {
    return NextResponse.json({ websites: [], totalCitations: 0, avgAiScore: null, optimizationTasks: [] });
  }

  const projectId = req.nextUrl.searchParams.get('project');
  if (!projectId) {
    return NextResponse.json({ websites: [], totalCitations: 0, avgAiScore: null, optimizationTasks: [] });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
  });
  if (!project) {
    return NextResponse.json({ websites: [], totalCitations: 0, avgAiScore: null, optimizationTasks: [] });
  }

  try {
    const role = await getWorkspaceRole(session.user.id, workspaceId);
    if (!role) return NextResponse.json({ websites: [], totalCitations: 0, avgAiScore: null, optimizationTasks: [] });
    const serviceToken = await issueVisibilityProjectJWT({
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      workspaceId,
      projectId: project.id,
      role,
    });
    const data = await proxyRequest({
      projectId: project.id,
      service: 'visibility',
      path: `/api/integration/summary?project_id=${encodeURIComponent(project.id)}`,
      accessToken: serviceToken,
    });

    const result = data as Record<string, unknown>;
    const platformCoverage = Array.isArray(result.platformCoverage)
      ? result.platformCoverage as Array<{ name?: string; score?: number }>
      : [];
    const suggestions = Array.isArray(result.suggestions)
      ? result.suggestions as Array<{ text?: string; priority?: string }>
      : [];

    return NextResponse.json({
      websites: platformCoverage.map((platform, index) => ({
        id: platform.name ?? String(index),
        name: platform.name ?? '',
        domain: platform.name ?? '',
        aiScore: platform.score ?? null,
        citationCount: 0,
        lastAnalyzedAt: null,
      })),
      totalCitations: (result.mentionCount as number) ?? 0,
      avgAiScore: (result.overallScore as number) ?? null,
      optimizationTasks: suggestions.map((suggestion, index) => ({
        text: suggestion.text ?? '',
        priority: suggestion.priority ?? 'medium',
        status: 'pending',
      })),
    });
  } catch {
    return NextResponse.json({ websites: [], totalCitations: 0, avgAiScore: null, optimizationTasks: [] });
  }
}
