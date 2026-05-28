import { prisma } from '@/lib/db';
import { syncBrandToProject } from '@/lib/proxy/zhijian-client';
import { isUniqueViolation } from '@/lib/prisma-helpers';

/**
 * Auto-create an own (non-competitor) brand, associate it with a project,
 * and sync to 智見. Non-blocking — errors are logged, not thrown.
 */
export async function createBrandForProject(
  brandName: string,
  projectId: string,
  workspaceId: string,
): Promise<void> {
  try {
    const brand = await prisma.brand.create({
      data: { name: brandName.trim(), isCompetitor: false, workspaceId },
    });

    await prisma.projectBrand.create({
      data: { projectId, brandId: brand.id },
    });

    const syncResult = await syncBrandToProject(brand, projectId, null);
    if ('remoteIds' in syncResult && Object.keys(syncResult.remoteIds).length > 0) {
      await prisma.brand.update({
        where: { id: brand.id },
        data: { remoteIds: syncResult.remoteIds },
      });
    } else if ('error' in syncResult) {
      console.warn(`[brand-auto-create] Sync failed: ${syncResult.error}`);
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Brand name already exists — find it and create association
      try {
        const existing = await prisma.brand.findFirst({
          where: { name: brandName.trim(), workspaceId, deletedAt: null },
        });
        if (existing) {
          await prisma.projectBrand.upsert({
            where: { projectId_brandId: { projectId, brandId: existing.id } },
            create: { projectId, brandId: existing.id },
            update: {},
          });
        }
      } catch (attachErr) {
        console.error('[brand-auto-create] Failed to attach existing brand:', (attachErr as Error).message);
      }
    } else {
      console.error('[brand-auto-create] Failed:', (err as Error).message);
    }
  }
}
