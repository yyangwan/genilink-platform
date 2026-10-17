import { NextRequest, NextResponse } from 'next/server';
import { withBrandRoute } from '@/lib/auth/brand-route';
import { prisma } from '@/lib/db';
import { mutateRegisteredBrand } from '@/lib/visibility/brand-mutations';
import { AssociationError, attemptAssociationDelivery } from '@/lib/visibility/project-brand-associations';
import { ContextConflict } from '@/lib/visibility/project-context';
import { isUniqueViolation } from '@/lib/prisma-helpers';

type BrandIdRoute = (req: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>;

export const GET: BrandIdRoute = withBrandRoute(async (_req, { workspaceId }, params) => {
  const { id } = params!;

  const brand = await prisma.brand.findFirst({
    where: { id, workspaceId, deletedAt: null },
  });

  if (!brand) {
    return NextResponse.json({ error: '品牌不存在' }, { status: 404 });
  }

  return NextResponse.json(brand);
});

async function change(req: NextRequest, actor: { workspaceId: string; userId: string }, id: string, remove: boolean) {
  const input = remove ? {} : await req.json().catch(() => null);
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['name', 'aliases', 'isCompetitor', 'logo', 'website', 'description'].includes(key)) ||
      input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200) ||
      input.aliases !== undefined && (!Array.isArray(input.aliases) || input.aliases.length > 50 || !input.aliases.every((value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 200)) ||
      input.isCompetitor !== undefined && typeof input.isCompetitor !== 'boolean' ||
      ['logo', 'website', 'description'].some(key => input[key] !== undefined && input[key] !== null && (typeof input[key] !== 'string' || input[key].length > 10000))) return NextResponse.json({ error: '品牌资料参数无效' }, { status: 400 });
  try {
    const result = await mutateRegisteredBrand(actor, id, { ...input, ...(input.name === undefined ? {} : { name: input.name.trim() }) }, remove);
    // The transaction already committed every affected snapshot. Interactive delivery is bounded.
    let syncPending = result.projectIds.length > 0;
    if (result.projectIds.length === 1) syncPending = await attemptAssociationDelivery({ ...actor, projectId: result.projectIds[0] });
    return NextResponse.json(remove ? { success: true, syncPending } : { ...result.brand, syncPending });
  } catch (error) {
    if (error instanceof AssociationError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ContextConflict || isUniqueViolation(error)) return NextResponse.json({ error: error instanceof ContextConflict ? error.message : '同名品牌已存在' }, { status: 409 });
    throw error;
  }
}
export const PATCH: BrandIdRoute = withBrandRoute(async (req, actor, params) => change(req, actor, params!.id, false));
export const DELETE: BrandIdRoute = withBrandRoute(async (req, actor, params) => change(req, actor, params!.id, true));
