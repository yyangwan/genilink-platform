import { NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { getCalendarEvents } from '@/lib/content/service';

export const GET = withContentAuth(async (ctx: ContentAuthContext) => {
  try {
    return NextResponse.json({ data: await getCalendarEvents(ctx) });
  } catch (err) { return handleProxyError(err); }
}, { action: 'read' });
