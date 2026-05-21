import { prisma } from '@/lib/db';

export type ContentAction = 'read' | 'write' | 'delete';

type Role = 'owner' | 'admin' | 'member';

const ROLE_CAPABILITIES: Record<Role, ContentAction[]> = {
  owner: ['read', 'write', 'delete'],
  admin: ['read', 'write', 'delete'],
  member: ['read', 'write'],
};

export class PermissionDeniedError extends Error {
  constructor(
    public readonly action: ContentAction,
    public readonly role: string,
  ) {
    super(`Role '${role}' cannot perform action '${action}'`);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Check that a user's workspace role permits the given content action.
 * Throws PermissionDeniedError if the role lacks the capability.
 */
export async function requirePermission(
  userId: string,
  workspaceId: string,
  action: ContentAction,
): Promise<Role> {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, workspaceId },
    select: { role: true },
  });

  if (!membership) {
    throw new PermissionDeniedError(action, 'none');
  }

  const role = membership.role as Role;
  const capabilities = ROLE_CAPABILITIES[role];

  if (!capabilities || !capabilities.includes(action)) {
    throw new PermissionDeniedError(action, role);
  }

  return role;
}
