import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { markNotificationRead } from '@/lib/content/service';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { id } = await params;
    try {
      await markNotificationRead(ctx, id);
      return NextResponse.json({ success: true });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'write' })(req);
}
