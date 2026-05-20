import { prisma } from '@/lib/db';

export async function getUserWorkspaceId(userId: string): Promise<string | null> {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: 'asc' },
  });
  return membership?.workspaceId ?? null;
}

export async function validateWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean> {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, workspaceId },
  });
  return !!membership;
}

/**
 * Verify that a project belongs to the given workspace.
 * Returns the project if found, or null if not.
 * Used by integration API routes to prevent cross-workspace data access.
 */
export async function verifyProjectInWorkspace(
  projectId: string,
  workspaceId: string,
) {
  return prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  });
}
