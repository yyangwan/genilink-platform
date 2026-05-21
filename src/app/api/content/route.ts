import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { proxyRequest } from '@/lib/proxy/zhijian-client';
import { handleProxyError } from '@/lib/proxy/proxy-errors';

export const GET = withContentAuth(async (ctx: ContentAuthContext) => {
  try {
    const data = await proxyRequest({
      projectId: ctx.projectId,
      service: 'content',
      path: '/api/projects/:id/contents',
      accessToken: process.env.SERVICE_TOKEN,
    });
    return NextResponse.json({ data });
  } catch (err) {
    return handleProxyError(err);
  }
});

export const POST = withContentAuth(async (ctx: ContentAuthContext, req: NextRequest) => {
  const body = await req.json();
  const { projectId, ...payload } = body;

  try {
    const data = await proxyRequest({
      projectId: ctx.projectId,
      service: 'content',
      path: '/api/projects/:id/contents',
      method: 'POST',
      body: payload,
      accessToken: process.env.SERVICE_TOKEN,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return handleProxyError(err);
  }
});
