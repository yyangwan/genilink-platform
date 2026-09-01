import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { validateWorkspaceAccess } from '@/lib/auth/workspace';

/**
 * Resolve a preferred workspace only when the user is actually a member.
 * A stale cookie can survive logout and belong to a different account.
 */
export async function resolveWorkspaceId(
  userId: string,
  preferredWorkspaceId?: string | null,
): Promise<string | null> {
  if (preferredWorkspaceId && await validateWorkspaceAccess(userId, preferredWorkspaceId)) {
    return preferredWorkspaceId;
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: 'asc' },
    select: { workspaceId: true },
  });

  return membership?.workspaceId ?? null;
}

/**
 * Resolve the active workspace ID from cookie, with auto-recovery.
 * If the cookie is missing, looks up the user's first workspace membership.
 * Returns null only if the user has no workspaces at all.
 */
export async function getWorkspaceId(userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get('genilink-workspace')?.value;
  const workspaceId = await resolveWorkspaceId(userId, cookie);

  if (workspaceId && workspaceId !== cookie) {
    // Persist to cookie so subsequent requests don't need DB lookup
    cookieStore.set('genilink-workspace', workspaceId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60,
      path: '/',
    });
  }

  return workspaceId;
}
