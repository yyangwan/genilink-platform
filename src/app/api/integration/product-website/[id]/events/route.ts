import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard } from '@/lib/proxy/route-guard';
import { proxySSE } from '@/lib/proxy/sse-stream';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const { id } = await params;
  try {
    const upstreamUrl = result.ctx.upstreamUrl(`/api/product-website/${encodeURIComponent(id)}/events`);
    return await proxySSE(upstreamUrl, result.ctx.headers);
  } catch (err) {
    const message = (err as Error).message;
    if (message === 'TIMEOUT') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Failed to stream product website analysis status' }, { status: 502 });
  }
}
