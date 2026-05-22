import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { publishContent } from '@/lib/content/service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    const { projectId, ...payload } = await req.json();
    try {
      return NextResponse.json({ data: await publishContent(ctx.projectId, ctx.externalId, ctx.serviceToken, id, payload) });
    } catch (err) {
      return handleProxyError(err, 'Failed to publish content');
    }
  }, { action: 'write' })(req);
}
