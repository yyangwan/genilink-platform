import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { proxyRequest } from '@/lib/proxy/zhijian-client';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    try {
      const data = await proxyRequest({
        projectId: ctx.projectId,
        service: 'content',
        path: `/api/contents/${id}`,
        accessToken: process.env.SERVICE_TOKEN,
      });
      return NextResponse.json({ data });
    } catch (err) {
      return handleError(err);
    }
  })(req);
}

export async function PUT(
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
        path: `/api/contents/${id}`,
        method: 'PUT',
        body: payload,
        accessToken: process.env.SERVICE_TOKEN,
      });
      return NextResponse.json({ data });
    } catch (err) {
      return handleError(err);
    }
  })(req);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    try {
      await proxyRequest({
        projectId: ctx.projectId,
        service: 'content',
        path: `/api/contents/${id}`,
        method: 'DELETE',
        accessToken: process.env.SERVICE_TOKEN,
      });
      return NextResponse.json({ success: true });
    } catch (err) {
      return handleError(err);
    }
  })(req);
}

function handleError(err: unknown): NextResponse {
  const message = (err as Error).message;
  if (message === 'TIMEOUT') return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
  if (message === 'NOT_FOUND') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (message === 'AUTH_EXPIRED') return NextResponse.json({ error: 'Service auth expired' }, { status: 502 });
  return NextResponse.json({ error: 'Failed to connect to content service' }, { status: 502 });
}
