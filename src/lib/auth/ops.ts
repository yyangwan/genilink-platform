import 'server-only';

import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';

export class OpsAuthorizationError extends Error {
  constructor(public readonly status: 401 | 403) {
    super(status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN');
  }
}

function bootstrapIds() {
  return new Set((process.env.OPS_USER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean));
}

export function effectiveSystemRole(user: { id: string; systemRole: string }) {
  return bootstrapIds().has(user.id) ? 'admin' : user.systemRole;
}

export async function requireOps() {
  const session = await auth();
  if (!session?.user?.id) throw new OpsAuthorizationError(401);
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, systemRole: true },
  });
  if (!user) throw new OpsAuthorizationError(401);
  const effectiveRole = effectiveSystemRole(user);
  if (effectiveRole !== 'ops' && effectiveRole !== 'admin') throw new OpsAuthorizationError(403);
  return { ...user, systemRole: effectiveRole };
}

export async function requireAdmin() {
  const user = await requireOps();
  if (user.systemRole !== 'admin') throw new OpsAuthorizationError(403);
  return user;
}
