import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { refreshPlatformToken } from '@/lib/content/service';

export async function POST(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { platform } = await params;
    try {
      return NextResponse.json({ data: await refreshPlatformToken(ctx, platform) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'write' })(req);
}
