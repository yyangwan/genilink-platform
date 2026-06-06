import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { listBrandVoices, createBrandVoice } from '@/lib/content/service';
import { normalizeBrandVoice, normalizeBrandVoices, toUpstreamBrandVoicePayload } from '@/lib/content/contract-adapters';

export const GET = withContentAuth(async (ctx: ContentAuthContext) => {
  try {
    return NextResponse.json({ data: normalizeBrandVoices(await listBrandVoices(ctx)) });
  } catch (err) { return handleProxyError(err); }
}, { action: 'read' });

export const POST = withContentAuth(async (ctx: ContentAuthContext, req: NextRequest) => {
  const { projectId, ...payload } = await req.json();
  try {
    const result = await createBrandVoice(ctx, toUpstreamBrandVoicePayload(payload));
    return NextResponse.json({ data: normalizeBrandVoice(result) }, { status: 201 });
  } catch (err) { return handleProxyError(err); }
}, { action: 'write' });
