import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { getGenieSource, updateGenieSource, deleteGenieSource, analyzeGenieSource } from '@/lib/content/service';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    try {
      return NextResponse.json({ data: await getGenieSource(ctx, id) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'read' })(req);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    const { projectId, ...payload } = await req.json();
    try {
      return NextResponse.json({ data: await updateGenieSource(ctx, id, payload) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'write' })(req);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    try {
      await deleteGenieSource(ctx, id);
      return NextResponse.json({ success: true });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'delete' })(req);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    const { projectId, ...payload } = await req.json();
    try {
      return NextResponse.json({ data: await analyzeGenieSource(ctx, id, payload) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'write' })(req);
}
