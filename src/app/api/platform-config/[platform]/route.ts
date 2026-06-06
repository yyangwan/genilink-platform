import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { getPlatformConfig, setPlatformConfig, deletePlatformConfig } from '@/lib/content/service';
import { normalizePlatformConfig } from '@/lib/content/contract-adapters';

export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { platform } = await params;
    try {
      return NextResponse.json({ data: normalizePlatformConfig(await getPlatformConfig(ctx, platform), platform) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'read' })(req);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { platform } = await params;
    const { projectId, ...payload } = await req.json();
    if (!payload.appId && !payload.appSecret && !payload.accessToken && !payload.refreshToken) {
      return NextResponse.json({ error: 'Missing platform credentials' }, { status: 400 });
    }
    try {
      return NextResponse.json({ data: normalizePlatformConfig(await setPlatformConfig(ctx, platform, payload), platform) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'write' })(req);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { platform } = await params;
    try {
      await deletePlatformConfig(ctx, platform);
      return NextResponse.json({ success: true });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'delete' })(req);
}
