import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { createReviewLink, getReviewLink } from '@/lib/content/service';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    const { projectId, ...payload } = await req.json();
    try {
      return NextResponse.json({ data: await createReviewLink(ctx, id, payload) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'write' })(req);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    try {
      return NextResponse.json({ data: await getReviewLink(ctx, id) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'read' })(req);
}
