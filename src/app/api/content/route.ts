import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { listContents, createContent } from '@/lib/content/service';
import { normalizeContentList } from '@/lib/content/contract-adapters';

export const GET = withContentAuth(async (ctx: ContentAuthContext) => {
  try {
    return NextResponse.json({ data: normalizeContentList(await listContents(ctx)) });
  } catch (err) {
    return handleProxyError(err);
  }
}, { action: 'read' });

export const POST = withContentAuth(async (ctx: ContentAuthContext, req: NextRequest) => {
  const { projectId, ...payload } = await req.json();
  try {
    return NextResponse.json({ data: await createContent(ctx, payload) }, { status: 201 });
  } catch (err) {
    return handleProxyError(err);
  }
}, { action: 'write' });
