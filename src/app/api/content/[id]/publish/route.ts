import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { proxyRequest } from '@/lib/proxy/zhijian-client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    const body = await req.json();
    const { projectId, ...payload } = body;

    try {
      const data = await proxyRequest({
        projectId: ctx.projectId,
        service: 'content',
        path: `/api/contents/${id}/publish`,
        method: 'POST',
        body: payload,
        accessToken: process.env.SERVICE_TOKEN,
      });
      return NextResponse.json({ data });
    } catch (err) {
      const message = (err as Error).message;
      if (message === 'TIMEOUT') return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
      return NextResponse.json({ error: 'Failed to publish content' }, { status: 502 });
    }
  })(req);
}
