import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { validateWorkspaceAccess } from '@/lib/auth/workspace';

/**
 * Resolve the active workspace ID from cookie, with auto-recovery.
 * If the cookie is missing, looks up the user's first workspace membership.
 * Returns null only if the user has no workspaces at all.
 */
export async function getWorkspaceId(userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get('genilink-workspace')?.value;
  if (cookie && await validateWorkspaceAccess(userId, cookie)) {
    return cookie;
  }

  // Auto-recover: pick first workspace membership
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: 'asc' },
    select: { workspaceId: true },
  });

  if (membership) {
    // Persist to cookie so subsequent requests don't need DB lookup
    cookieStore.set('genilink-workspace', membership.workspaceId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60,
      path: '/',
    });
    return membership.workspaceId;
  }

  return null;
}
