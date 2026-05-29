import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard } from '@/lib/proxy/route-guard';
import { proxySSE } from '@/lib/proxy/sse-stream';

export async function GET(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const auditId = req.nextUrl.searchParams.get('auditId');
  if (!auditId) {
    return NextResponse.json({ error: 'Missing auditId query parameter' }, { status: 400 });
  }

  try {
    const serviceToken = process.env.SERVICE_TOKEN || '';
    const upstreamUrl = result.ctx.upstreamUrl(`/api/audits/${auditId}/events?token=${encodeURIComponent(serviceToken)}`);
    return proxySSE(upstreamUrl, { Authorization: `Bearer ${serviceToken}` });
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'TIMEOUT') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Failed to stream audit status' }, { status: 502 });
  }
}
