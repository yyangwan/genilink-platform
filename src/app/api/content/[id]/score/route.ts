import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { scoreContent } from '@/lib/content/service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    try {
      return NextResponse.json({ data: await scoreContent(ctx.projectId, ctx.externalId, id) });
    } catch (err) {
      return handleProxyError(err, 'Failed to score content');
    }
  }, { action: 'read' })(req);
}
