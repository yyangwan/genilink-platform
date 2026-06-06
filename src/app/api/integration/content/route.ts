import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { requireBilling, BillingError } from '@/lib/billing/guard';
import { verifyProjectInWorkspace } from '@/lib/auth/workspace';
import { proxyRequest } from '@/lib/proxy/zhijian-client';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { getWorkspaceRole } from '@/lib/auth/workspace';
import { issueContentProjectJWT } from '@/lib/auth/service-jwt';
import { buildContentSummary } from '@/lib/content/content-summary';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) {
    return NextResponse.json(
      { error: 'No workspace selected' },
      { status: 400 }
    );
  }

  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json(
      { error: 'Missing projectId query parameter' },
      { status: 400 }
    );
  }

  // Verify project belongs to workspace
  const _project = await verifyProjectInWorkspace(projectId, workspaceId);
  if (!_project) {
    return NextResponse.json({ error: 'Project not found in workspace' }, { status: 403 });
  }

  // Check billing
  try {
    await requireBilling(session.user.id, workspaceId, 'content');
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json(
        { error: 'NO_SUBSCRIPTION', module: 'content' },
        { status: 403 }
      );
    }
    throw err;
  }

  // Proxy to content service
  try {
    const role = await getWorkspaceRole(session.user.id, workspaceId);
    if (!role) {
      return NextResponse.json({ error: 'Not a workspace member' }, { status: 403 });
    }
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

    return NextResponse.json({
      data: buildContentSummary(
        contentList,
        analyticsData,
        contentItems.status === 'fulfilled',
      ),
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'TIMEOUT') {
      return NextResponse.json(
        { error: 'Upstream timeout' },
        { status: 504 }
      );
    }
    if (message === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'Project not found in content service' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch content data' },
      { status: 502 }
    );
  }
}
