import { NextRequest } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { proxyStreamRequest } from '@/lib/proxy/zhijian-client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    const body = await req.json();
    const { projectId, ...payload } = body;

    return proxyStreamRequest({
      projectId: ctx.projectId,
      service: 'content',
      path: `/api/contents/${id}/generate`,
      method: 'POST',
      body: payload,
      accessToken: process.env.SERVICE_TOKEN,
    });
  })(req);
}
