import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { listGenieSources, addGenieSource } from '@/lib/content/service';

export async function GET(req: NextRequest) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    try {
      return NextResponse.json({ data: await listGenieSources(ctx) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'read' })(req);
}

export async function POST(req: NextRequest) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { projectId, ...payload } = await req.json();
    try {
      return NextResponse.json({ data: await addGenieSource(ctx, payload) }, { status: 201 });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'write' })(req);
}
