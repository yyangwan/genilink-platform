import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { updateContentStatus } from '@/lib/content/service';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    const { projectId, ...payload } = await req.json();
    try {
      return NextResponse.json({ data: await updateContentStatus(ctx, id, payload) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'write' })(req);
}
