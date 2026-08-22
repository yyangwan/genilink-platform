import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { getPlatformConfig, setPlatformConfig, deletePlatformConfig } from '@/lib/content/service';
import { normalizePlatformConfig } from '@/lib/content/contract-adapters';
import { isPublishingPlatformId } from '@/lib/content/publishing-platforms';
import { z } from 'zod';

const platformConfigSchema = z.object({
  projectId: z.string().min(1),
  accountName: z.string().trim().max(120).optional(),
  appId: z.string().trim().max(500).optional(),
  appSecret: z.string().trim().max(4000).optional(),
  accessToken: z.string().trim().max(8000).optional(),
  refreshToken: z.string().trim().max(8000).optional(),
  enabled: z.boolean().optional(),
});

function unsupportedPlatform() {
  return NextResponse.json({ error: 'Unsupported publishing platform' }, { status: 404 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { platform } = await params;
    if (!isPublishingPlatformId(platform)) return unsupportedPlatform();
    try {
      return NextResponse.json({ data: normalizePlatformConfig(await getPlatformConfig(ctx, platform), platform) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'read', capability: 'platformConfig' })(req);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { platform } = await params;
    if (!isPublishingPlatformId(platform)) return unsupportedPlatform();
    const parsed = platformConfigSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid platform configuration' }, { status: 400 });
    }
    const { projectId, ...payload } = parsed.data;
    if (!payload.appId && !payload.appSecret && !payload.accessToken && !payload.refreshToken) {
      return NextResponse.json({ error: 'Missing platform credentials' }, { status: 400 });
    }
    try {
      return NextResponse.json({ data: normalizePlatformConfig(await setPlatformConfig(ctx, platform, payload), platform) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'write', capability: 'platformConfig' })(req);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { platform } = await params;
    if (!isPublishingPlatformId(platform)) return unsupportedPlatform();
    try {
      await deletePlatformConfig(ctx, platform);
      return NextResponse.json({ success: true });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'delete', capability: 'platformConfig' })(req);
}
