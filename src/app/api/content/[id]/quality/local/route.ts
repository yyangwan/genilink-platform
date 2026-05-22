import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { getContentQualityLocal } from '@/lib/content/service';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    try {
      return NextResponse.json({ data: await getContentQualityLocal(ctx, id) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'read' })(req);
}
