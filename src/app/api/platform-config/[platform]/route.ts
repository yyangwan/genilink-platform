import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { getPlatformConfig, setPlatformConfig, deletePlatformConfig } from '@/lib/content/service';

export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { platform } = await params;
    try {
      return NextResponse.json({ data: await getPlatformConfig(ctx, platform) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'read' })(req);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { platform } = await params;
    const { projectId, ...payload } = await req.json();
    try {
      return NextResponse.json({ data: await setPlatformConfig(ctx, platform, payload) });
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
