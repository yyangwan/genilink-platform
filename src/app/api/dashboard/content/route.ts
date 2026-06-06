import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { proxyRequest } from '@/lib/proxy/zhijian-client';
import { getWorkspaceRole } from '@/lib/auth/workspace';
import { issueContentProjectJWT } from '@/lib/auth/service-jwt';
import { buildContentSummary } from '@/lib/content/content-summary';

const emptyData = { totalContent: 0, publishedCount: 0, recentContent: [], qualityAvg: null };

// GET /api/dashboard/content — fetch real content data from 智創
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceId(session.user.id);

  if (!workspaceId) {
    return NextResponse.json(emptyData);
  }

  const projectId = req.nextUrl.searchParams.get('project');
  if (!projectId) {
    return NextResponse.json(emptyData);
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
  });
  if (!project) {
    return NextResponse.json(emptyData);
  }

  try {
    const role = await getWorkspaceRole(session.user.id, workspaceId);
    if (!role) return NextResponse.json(emptyData);
    const serviceToken = await issueContentProjectJWT({
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      workspaceId,
      projectId,
      role,
    });
    const [contentItems, analytics] = await Promise.allSettled([
      proxyRequest({
        projectId,
        service: 'content',
        path: `/api/content?projectId=${encodeURIComponent(projectId)}`,
        accessToken: serviceToken,
      }),
      proxyRequest({
        projectId,
        service: 'content',
        path: '/api/analytics?timeRange=30',
        accessToken: serviceToken,
      }),
    ]);

    const contentList = contentItems.status === 'fulfilled' && Array.isArray(contentItems.value)
      ? contentItems.value as Array<{ id: string; title: string; platform: string; status: string; createdAt: string }>
      : [];
    const analyticsData = analytics.status === 'fulfilled'
      ? analytics.value as {
          summary?: {
            totalContent?: number;
            publishedCount?: number;
            avgQualityScore?: number | null;
          };
          recentActivity?: Array<{ id: string; title: string; status: string; projectName: string; createdAt: string }>;
        }
      : null;

    const summary = buildContentSummary(
      contentList,
      analyticsData,
      contentItems.status === 'fulfilled',
    );
    return NextResponse.json(summary);
  } catch {
    return NextResponse.json(emptyData);
  }
}
