import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { proxyRequest } from '@/lib/proxy/zhijian-client';

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
    return handleError(err);
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
    return handleError(err);
  }
});

function handleError(err: unknown): NextResponse {
  const message = (err as Error).message;
  if (message === 'TIMEOUT') return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
  if (message === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (message === 'AUTH_EXPIRED') return NextResponse.json({ error: 'Service auth expired' }, { status: 502 });
  return NextResponse.json({ error: 'Failed to connect to content service' }, { status: 502 });
}
