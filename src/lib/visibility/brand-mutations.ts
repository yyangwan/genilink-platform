import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { hasBrandCapacity } from '@/lib/billing/access';
import { AssociationError } from './project-brand-associations';
import { freezeContextInTransaction, lockContextProject } from './project-context';
export async function mutateRegisteredBrand(actor: { workspaceId: string; userId: string }, brandId: string, updates: Prisma.BrandUpdateInput, remove = false) {
  return prisma.$transaction(async tx => {
    const member = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: actor } });
    if (!member || !['owner', 'admin', 'editor', 'member'].includes(member.role)) throw new AssociationError('需要品牌写入权限', 403);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Workspace" WHERE id = ${actor.workspaceId} FOR UPDATE`);
    const existing = await tx.brand.findFirst({ where: { id: brandId, workspaceId: actor.workspaceId, deletedAt: null } });
    if (!existing) throw new AssociationError('品牌不存在', 404);
    if (typeof updates.isCompetitor === 'boolean' && updates.isCompetitor !== existing.isCompetitor && !await hasBrandCapacity(actor.userId, actor.workspaceId, updates.isCompetitor)) throw new AssociationError('目标品牌类别额度已满', 402);
    const rows = await tx.projectBrand.findMany({ where: { brandId, project: { workspaceId: actor.workspaceId } }, select: { projectId: true }, orderBy: { projectId: 'asc' } });
    for (const row of rows) await lockContextProject(tx, { ...actor, projectId: row.projectId, session: { user: { id: actor.userId } } });
    const brand = await tx.brand.update({ where: { id: brandId }, data: remove ? { deletedAt: new Date() } : updates });
    for (const row of rows) await freezeContextInTransaction(tx, { ...actor, projectId: row.projectId, session: { user: { id: actor.userId } } });
    return { brand, projectIds: rows.map(row => row.projectId) };
  });
}
