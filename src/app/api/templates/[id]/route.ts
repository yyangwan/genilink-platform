import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { getTemplate, updateTemplate, deleteTemplate } from '@/lib/content/service';
import { normalizeTemplate, toUpstreamTemplatePayload } from '@/lib/content/contract-adapters';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    try {
      return NextResponse.json({ data: normalizeTemplate(await getTemplate(ctx, id)) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'read' })(req);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    const { projectId, ...payload } = await req.json();
    try {
      const result = await updateTemplate(ctx, id, toUpstreamTemplatePayload(payload));
      return NextResponse.json({ data: normalizeTemplate(result) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'write' })(req);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    try {
      await deleteTemplate(ctx, id);
      return NextResponse.json({ success: true });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'delete' })(req);
}
