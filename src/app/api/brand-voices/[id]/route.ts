import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { getBrandVoice, updateBrandVoice, deleteBrandVoice } from '@/lib/content/service';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    try {
      return NextResponse.json({ data: await getBrandVoice(ctx, id) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'read' })(req);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    const { projectId, ...payload } = await req.json();
    try {
      return NextResponse.json({ data: await updateBrandVoice(ctx, id, payload) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'write' })(req);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    try {
      await deleteBrandVoice(ctx, id);
      return NextResponse.json({ success: true });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'delete' })(req);
}
