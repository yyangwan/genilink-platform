import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { listTemplates, createTemplate } from '@/lib/content/service';
import { normalizeTemplate, normalizeTemplates, toUpstreamTemplatePayload } from '@/lib/content/contract-adapters';

export const GET = withContentAuth(async (ctx: ContentAuthContext) => {
  try {
    return NextResponse.json({ data: normalizeTemplates(await listTemplates(ctx)) });
  } catch (err) { return handleProxyError(err); }
}, { action: 'read' });

export const POST = withContentAuth(async (ctx: ContentAuthContext, req: NextRequest) => {
  const { projectId, ...payload } = await req.json();
  try {
    const result = await createTemplate(ctx, toUpstreamTemplatePayload(payload));
    return NextResponse.json({ data: normalizeTemplate(result) }, { status: 201 });
  } catch (err) { return handleProxyError(err); }
}, { action: 'write' });
