import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard } from '@/lib/proxy/route-guard';

export async function POST(req: NextRequest) {
  const result = await resolveGuard(req, { requireProject: false });
  if (!result.ok) return result.response;

  const body = await req.json();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(result.ctx.upstreamUrl('/api/strategic/compare-audits'), {
      method: 'POST',
      headers: result.ctx.headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${res.status}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Failed to compare audits' }, { status: 502 });
  }
}
