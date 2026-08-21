import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { listTemplates, createTemplate } from '@/lib/content/service';
import { normalizeTemplate, normalizeTemplates, toUpstreamTemplatePayload } from '@/lib/content/contract-adapters';
import { getWorkspaceBillingAccess } from '@/lib/billing/access';

function countRecords(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== 'object') return 0;
  const record = value as { data?: unknown; items?: unknown; results?: unknown };
  if (Array.isArray(record.data)) return record.data.length;
  if (Array.isArray(record.items)) return record.items.length;
  if (Array.isArray(record.results)) return record.results.length;
  return 0;
}

export const GET = withContentAuth(async (ctx: ContentAuthContext) => {
  try {
    return NextResponse.json({ data: normalizeTemplates(await listTemplates(ctx)) });
  } catch (err) { return handleProxyError(err); }
}, { action: 'read' });

export const POST = withContentAuth(async (ctx: ContentAuthContext, req: NextRequest) => {
  const { projectId, ...payload } = await req.json();
  try {
    const access = await getWorkspaceBillingAccess(ctx.userId, ctx.workspaceId);
    const currentCount = countRecords(await listTemplates(ctx));
    if (currentCount >= access.limits.contentTemplates) {
      return NextResponse.json(
        {
          error: 'PLAN_LIMIT_EXCEEDED',
          feature: 'content_templates',
          used: currentCount,
          limit: access.limits.contentTemplates,
        },
        { status: 402 },
      );
    }

    const result = await createTemplate(ctx, toUpstreamTemplatePayload(payload));
    return NextResponse.json({ data: normalizeTemplate(result) }, { status: 201 });
  } catch (err) { return handleProxyError(err); }
}, { action: 'write' });
