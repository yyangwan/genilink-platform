import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import type { GuardContext } from '@/lib/proxy/route-guard';
import { ContextConflict, freezeContextInTransaction, lockContextProject } from './project-context';
export type BrandBindingInput = { brandId: string; entityId: string | null; analysisRole: 'registered' | 'comparison'; reason: string; expectedVersion: number; idempotencyKey: string };
export const brandBindingHash = (ctx: GuardContext, input: BrandBindingInput) => createHash('sha256').update(JSON.stringify([input, ctx.session.user.id])).digest('hex');
export async function saveBrandBinding(ctx: GuardContext, input: BrandBindingInput, proofVersion: number | null) {
  return prisma.$transaction(async tx => {
    const member = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: ctx.workspaceId, userId: ctx.session.user.id } } });
    if (!member || !['owner', 'admin', 'editor', 'member'].includes(member.role)) throw new ContextConflict('需要项目写入权限');
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Workspace" WHERE id = ${ctx.workspaceId} FOR UPDATE`);
    await lockContextProject(tx, ctx);
    const hash = brandBindingHash(ctx, input);
    const prior = await tx.projectBrandReviewEvent.findUnique({ where: { projectId_idempotencyKey: { projectId: ctx.projectId, idempotencyKey: input.idempotencyKey } } });
    if (prior) { if (prior.requestHash !== hash) throw new ContextConflict('操作编号已用于不同请求'); return prior; }
    const association = await tx.projectBrand.findUnique({ where: { projectId_brandId: { projectId: ctx.projectId, brandId: input.brandId } }, include: { brand: true } });
    if (!association || association.brand.workspaceId !== ctx.workspaceId || association.brand.deletedAt) throw new ContextConflict('品牌未关联到当前项目');
    const head = await tx.projectIntelligenceContext.findUnique({ where: { projectId: ctx.projectId } });
    if ((head?.version || 0) !== input.expectedVersion) throw new ContextConflict('品牌配置已变化，请刷新后复核');
    if ((input.entityId === null) !== (proofVersion === null)) throw new ContextConflict('实体身份凭据缺失');
    if (input.entityId && await tx.projectBrand.findFirst({ where: { projectId: ctx.projectId, entityId: input.entityId, brandId: { not: input.brandId }, brand: { deletedAt: null } } })) throw new ContextConflict('实体已绑定其他品牌，请先解除原绑定');
    await tx.projectBrand.update({ where: { id: association.id }, data: { analysisRole: input.analysisRole, entityId: input.entityId, identityVersion: proofVersion } });
    const context = await freezeContextInTransaction(tx, ctx);
    return tx.projectBrandReviewEvent.create({ data: { projectId: ctx.projectId, brandId: input.brandId, entityId: input.entityId, identityVersion: proofVersion, analysisRole: input.analysisRole, reason: input.reason.trim(), createdBy: ctx.session.user.id, contextVersion: context.version, idempotencyKey: input.idempotencyKey, requestHash: hash } });
  });
}
