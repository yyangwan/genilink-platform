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

  const projects = await prisma.project.findMany({
    where: projectId ? { id: projectId, workspaceId } : { workspaceId },
    take: 1,
  });

  if (projects.length === 0) {
    return NextResponse.json({ websites: [], totalCitations: 0, avgAiScore: null, optimizationTasks: [] });
  }

  const project = projects[0];

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
      path: '/api/v1/projects/:id/geo-summary',
      accessToken: serviceToken,
    });

    const result = data as Record<string, unknown>;
    return NextResponse.json({
      websites: Array.isArray(result.websites) ? result.websites : [],
      totalCitations: (result.total_citations as number) ?? 0,
      avgAiScore: (result.avg_ai_score as number) ?? null,
      optimizationTasks: Array.isArray(result.optimization_tasks) ? result.optimization_tasks : [],
    });
  } catch {
    return NextResponse.json({ websites: [], totalCitations: 0, avgAiScore: null, optimizationTasks: [] });
  }
}
