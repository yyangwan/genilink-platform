import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { proxyRequest } from '@/lib/proxy/zhijian-client';
import { handleProxyError } from '@/lib/proxy/proxy-errors';

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
      return handleProxyError(err, 'Failed to publish content');
    }
  })(req);
}
