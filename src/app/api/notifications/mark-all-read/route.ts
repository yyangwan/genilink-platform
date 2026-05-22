import { NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { handleProxyError } from '@/lib/proxy/proxy-errors';
import { markAllNotificationsRead } from '@/lib/content/service';

export const POST = withContentAuth(async (ctx: ContentAuthContext) => {
  try {
    await markAllNotificationsRead(ctx);
    return NextResponse.json({ success: true });
  } catch (err) { return handleProxyError(err); }
}, { action: 'write' });
