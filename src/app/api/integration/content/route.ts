import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { requireBilling, BillingError } from '@/lib/billing/guard';
import { verifyProjectInWorkspace } from '@/lib/auth/workspace';
import { proxyRequest } from '@/lib/proxy/zhijian-client';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const workspaceId = cookieStore.get('genilink-workspace')?.value;
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
    const data = await proxyRequest({
      projectId,
      service: 'content',
      path: '/api/projects/:id/summary',
      accessToken: process.env.SERVICE_TOKEN,
    });

    return NextResponse.json({ data });
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
