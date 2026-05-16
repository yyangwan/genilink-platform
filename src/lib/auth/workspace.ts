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
