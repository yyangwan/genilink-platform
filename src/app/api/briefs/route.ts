import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { listBriefs, createBrief } from '@/lib/content/service';

export const GET = withContentAuth(async (ctx: ContentAuthContext) => {
  try {
    return NextResponse.json({ data: await listBriefs(ctx) });
  } catch (err) { return handleProxyError(err); }
}, { action: 'read' });

export const POST = withContentAuth(async (ctx: ContentAuthContext, req: NextRequest) => {
  const { projectId, ...payload } = await req.json();
  try {
    return NextResponse.json({ data: await createBrief(ctx, payload) }, { status: 201 });
  } catch (err) { return handleProxyError(err); }
}, { action: 'write' });
