import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { refreshPlatformToken } from '@/lib/content/service';
import { isPublishingPlatformId } from '@/lib/content/publishing-platforms';

export async function POST(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { platform } = await params;
    if (!isPublishingPlatformId(platform)) {
      return NextResponse.json({ error: 'Unsupported publishing platform' }, { status: 404 });
    }
    try {
      return NextResponse.json({ data: await refreshPlatformToken(ctx, platform) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'write' })(req);
}
