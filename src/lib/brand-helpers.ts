import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { hasBrandCapacity } from '@/lib/billing/access';
import { freezeContextInTransaction, lockContextProject } from '@/lib/visibility/project-context';

/** Optional project initialization. A false result is reported explicitly by the caller. */
export async function createBrandForProject(brandName: string, projectId: string, workspaceId: string, userId: string): Promise<boolean> {
  if (!brandName.trim() || brandName.length > 200) return false;
  try {
    await prisma.$transaction(async tx => {
      const member = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
      if (!member || !['owner', 'admin', 'editor', 'member'].includes(member.role)) throw new Error('Brand initialization not authorized');
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`);
      const ctx = { projectId, workspaceId, session: { user: { id: userId } } };
      await lockContextProject(tx, ctx);
      let brand = await tx.brand.findFirst({ where: { name: brandName.trim(), workspaceId, deletedAt: null } });
      if (brand?.isCompetitor) throw new Error('Own brand conflicts with competitor registration');
      if (!brand) {
        if (!await hasBrandCapacity(userId, workspaceId, false)) throw new Error('Brand registration capacity exhausted');
        brand = await tx.brand.create({ data: { name: brandName.trim(), isCompetitor: false, workspaceId } });
      }
      await tx.projectBrand.upsert({ where: { projectId_brandId: { projectId, brandId: brand.id } }, create: { projectId, brandId: brand.id }, update: {} });
      await freezeContextInTransaction(tx, ctx);
    });
    return true;
  } catch { return false; }
}
