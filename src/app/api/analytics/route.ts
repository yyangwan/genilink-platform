import { NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { getAnalytics } from '@/lib/content/service';
import { normalizeAnalyticsData } from '@/lib/content/contract-adapters';

export const GET = withContentAuth(async (ctx: ContentAuthContext) => {
  try {
    return NextResponse.json({ data: normalizeAnalyticsData(await getAnalytics(ctx)) });
  } catch (err) { return handleProxyError(err); }
}, { action: 'read' });
