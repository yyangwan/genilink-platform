import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { requireBilling, BillingError } from '@/lib/billing/guard';
import { getExternalId } from '@/lib/proxy/zhijian-client';
import { proxySSE } from '@/lib/proxy/sse-stream';
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

  // Get external ID for the visibility service
  try {
    // We need to resolve the external ID to construct the SSE URL
    // Reuse proxyRequest's internal logic by calling the visibility endpoint path
    // For SSE, we construct the URL directly and use proxySSE
    const externalId = await getExternalId(projectId, 'visibility');

    if (!externalId) {
      return NextResponse.json(
        { error: 'No external mapping for project' },
        { status: 404 }
      );
    }

    const baseUrl =
      process.env.VISIBILITY_SERVICE_URL || 'http://localhost:8000';
    const upstreamUrl = `${baseUrl}/api/v1/projects/${externalId}/audit/stream`;

    return proxySSE(upstreamUrl, {
      Authorization: `Bearer ${process.env.SERVICE_TOKEN || ''}`,
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'TIMEOUT') {
      return NextResponse.json(
        { error: 'Upstream timeout' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to stream audit status' },
      { status: 502 }
    );
  }
}
