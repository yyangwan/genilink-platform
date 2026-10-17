import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { issueVisibilityProjectJWT } from '@/lib/auth/service-jwt';
import { ContextConflict, deliverProjectContext, freezeContextInTransaction, lockContextProject } from './project-context';
export class AssociationError extends Error { constructor(message: string, public status: number) { super(message); } }
type Actor = { projectId: string; workspaceId: string; userId: string };
export async function changeBrandAssociation(actor: Actor, brandId: string, action: 'associate' | 'remove') {
  return prisma.$transaction(async tx => {
    const member = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: actor.userId } } });
    if (!member || !['owner', 'admin', 'editor', 'member'].includes(member.role)) throw new AssociationError('需要项目写入权限', 403);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Workspace" WHERE id = ${actor.workspaceId} FOR UPDATE`);
    const ctx = { projectId: actor.projectId, workspaceId: actor.workspaceId, session: { user: { id: actor.userId } } };
    try { await lockContextProject(tx, ctx); } catch (error) { if (error instanceof ContextConflict) throw new AssociationError('项目不存在', 404); throw error; }
    const brands = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "Brand" WHERE id = ${brandId} AND "workspaceId" = ${actor.workspaceId} AND "deletedAt" IS NULL FOR UPDATE`);
    if (!brands.length) throw new AssociationError('品牌不存在', 404);
    if (action === 'associate') {
      const existing = await tx.projectBrand.findUnique({ where: { projectId_brandId: { projectId: actor.projectId, brandId } } });
      if (existing) throw new AssociationError('品牌已关联到此项目', 409);
      await tx.projectBrand.create({ data: { projectId: actor.projectId, brandId } });
    } else {
      const removed = await tx.projectBrand.deleteMany({ where: { projectId: actor.projectId, brandId } });
      if (!removed.count) throw new AssociationError('关联不存在', 404);
    }
    return freezeContextInTransaction(tx, ctx);
  });
}
export async function attemptAssociationDelivery(actor: Actor) {
  try {
    const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: actor.userId } } });
    const project = await prisma.project.findFirst({ where: { id: actor.projectId, workspaceId: actor.workspaceId } });
    if (!project || !member || !['owner', 'admin', 'editor', 'member'].includes(member.role)) return true;
    const token = await issueVisibilityProjectJWT({ userId: actor.userId, workspaceId: actor.workspaceId, projectId: actor.projectId, role: member.role });
    const failure = await deliverProjectContext({ projectId: actor.projectId, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, upstreamUrl: path => `${process.env.VISIBILITY_SERVICE_URL || 'http://127.0.0.1:8000'}${path}` }, 1);
    return !!failure || (await prisma.projectContextOutbox.count({ where: { projectId: actor.projectId, deliveredAt: null } })) > 0;
  } catch { return true; }
}
