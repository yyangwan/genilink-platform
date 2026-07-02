import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard } from '@/lib/proxy/route-guard';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const { id } = await params;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(result.ctx.upstreamUrl(`/api/product-website/${encodeURIComponent(id)}/pdf`), {
      headers: result.ctx.headers,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${res.status}` },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('Content-Type') || 'application/pdf';
    const filename = res.headers.get('Content-Disposition')?.match(/filename="?(.+?)"?$/)?.[1]
      || `product-website-analysis-${id}.pdf`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Failed to fetch product website PDF' }, { status: 502 });
  }
}
