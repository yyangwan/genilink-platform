import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { generateGenieContent, getGenieGenerations } from '@/lib/content/service';
import { normalizeGenieGenerationResult, unwrapGenieGenerations } from '@/lib/content/contract-adapters';

export async function POST(req: NextRequest) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const { projectId, ...payload } = await req.json();
    const result = await generateGenieContent(ctx, payload);
    return NextResponse.json({ data: normalizeGenieGenerationResult(result) });
  }, { action: 'write' })(req);
}

export async function GET(req: NextRequest) {
  return withContentAuth(async (ctx: ContentAuthContext) => {
    try {
      return NextResponse.json({ data: unwrapGenieGenerations(await getGenieGenerations(ctx)) });
    } catch (err) { return handleProxyError(err); }
  }, { action: 'read' })(req);
}
