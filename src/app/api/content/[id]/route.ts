import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { getContent, updateContent, deleteContent } from '@/lib/content/service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    try {
      return NextResponse.json({ data: await getContent(ctx.projectId, ctx.externalId, ctx.serviceToken, id) });
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
    const { projectId, ...payload } = await req.json();
    try {
      return NextResponse.json({ data: await updateContent(ctx.projectId, ctx.externalId, ctx.serviceToken, id, payload) });
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
      await deleteContent(ctx.projectId, ctx.externalId, ctx.serviceToken, id);
      return NextResponse.json({ success: true });
    } catch (err) {
      return handleProxyError(err);
    }
  }, { action: 'delete' })(req);
}
