import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { requireBilling, BillingError } from '@/lib/billing/guard';
import { proxySSE } from '@/lib/proxy/sse-stream';
import { getWorkspaceId } from '@/lib/auth/get-workspace';

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

  // Get the audit ID from query params
  const auditId = req.nextUrl.searchParams.get('auditId');
  if (!auditId) {
    return NextResponse.json(
      { error: 'Missing auditId query parameter' },
      { status: 400 }
    );
  }

  // Proxy SSE from visibility service
  try {
    const baseUrl =
      process.env.VISIBILITY_SERVICE_URL || 'http://localhost:8000';
    const serviceToken = process.env.SERVICE_TOKEN || '';
    // SSE endpoint streams per-platform completion events; requires token query param
    const upstreamUrl = `${baseUrl}/api/audits/${auditId}/events?token=${encodeURIComponent(serviceToken)}`;

    return proxySSE(upstreamUrl, {
      Authorization: `Bearer ${serviceToken}`,
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
