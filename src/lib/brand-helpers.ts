import { prisma } from '@/lib/db';
import { isUniqueViolation } from '@/lib/prisma-helpers';

/**
 * Auto-create an own (non-competitor) brand and associate it with a project.
 * No downstream sync needed — brands live only in 智鏈.
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
