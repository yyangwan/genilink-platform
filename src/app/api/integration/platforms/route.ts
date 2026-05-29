import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function GET(_req: NextRequest) {
  const result = await resolveGuard(_req, { requireProject: false });
  if (!result.ok) return result.response;

  const upstream = await fetchUpstream(result.ctx, '/api/platforms', {
    errorMessage: 'Failed to fetch platforms',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
