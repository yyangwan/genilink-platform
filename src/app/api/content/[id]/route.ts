import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { proxyRequest } from '@/lib/proxy/zhijian-client';
import { handleProxyError } from '@/lib/proxy/proxy-errors';

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
      return handleProxyError(err);
    }
  }, { action: 'read' })(req);
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
      return handleProxyError(err);
    }
  }, { action: 'write' })(req);
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
      return handleProxyError(err);
    }
  }, { action: 'delete' })(req);
}
