import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { requireBilling, BillingError } from '@/lib/billing/guard';
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

  // Check billing
  try {
    await requireBilling(session.user.id, workspaceId, 'visibility');
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json(
        { error: 'NO_SUBSCRIPTION', module: 'visibility' },
        { status: 403 }
      );
    }
    throw err;
  }

  // Proxy to FastAPI GEO analysis service
  try {
    const data = await proxyRequest({
      projectId,
      service: 'visibility',
      path: '/api/v1/projects/:id/geo-summary',
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
        { error: 'Project not found in GEO service' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch GEO data' },
      { status: 502 }
    );
  }
}
