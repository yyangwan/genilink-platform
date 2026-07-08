import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { getActiveModules } from '@/lib/billing/modules';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// POST /api/billing/access — refresh the active module cookie after billing changes
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
  }

  const activeModules = await getActiveModules(session.user.id, workspaceId);
  const cookieStore = await cookies();
  cookieStore.set('genilink-modules', activeModules.join(','), {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60,
    path: '/',
  });

  return NextResponse.json({
    workspaceId,
    activeModules,
  });
}
