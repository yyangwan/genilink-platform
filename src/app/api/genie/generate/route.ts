import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { generateGenieContent, getGenieGenerations } from '@/lib/content/service';

export async function POST(req: NextRequest) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { projectId, ...payload } = await req.json();
    return generateGenieContent(ctx, payload);
  }, { action: 'write' })(req);
}

export async function GET(req: NextRequest) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    try {
      return NextResponse.json({ data: await getGenieGenerations(ctx) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'read' })(req);
}
