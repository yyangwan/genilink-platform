import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { fetchUpstream, type GuardContext } from '@/lib/proxy/route-guard';

export class ContextConflict extends Error {}
type ContextActor = Pick<GuardContext, 'projectId' | 'workspaceId' | 'session'>;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export async function lockContextProject(tx: Prisma.TransactionClient, ctx: ContextActor) {
  const projects = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "Project" WHERE id = ${ctx.projectId} AND "workspaceId" = ${ctx.workspaceId} FOR UPDATE`);
  if (!projects.length) throw new ContextConflict('项目不存在');
}
export async function freezeContextInTransaction(tx: Prisma.TransactionClient, ctx: ContextActor, expectedVersion?: number) {
  const current = await tx.projectIntelligenceContext.findUnique({ where: { projectId: ctx.projectId } });
  const rows = await tx.projectBrand.findMany({ where: { projectId: ctx.projectId }, include: { brand: true }, orderBy: { brandId: 'asc' } });
  const brands = rows.filter(row => row.brand.workspaceId === ctx.workspaceId && !row.brand.deletedAt).map(row => ({ aliases: row.brand.aliases, analysis_role: row.analysisRole || 'registered', entity_id: row.entityId || null, id: row.brandId, identity_version: row.identityVersion || null, is_competitor: row.brand.isCompetitor, name: row.brand.name }));
  if (brands.length > 200 || brands.some(row => !row.name.trim() || row.name.length > 200 || row.aliases.length > 50 || row.id.length > 50)) throw new ContextConflict('品牌配置超出允许范围');
  const business_preferences = current?.businessPreferences || {};
  const contentHash = createHash('sha256').update(JSON.stringify(canonical({ brands, business_preferences }))).digest('hex');
  if (current?.contentHash === contentHash) return current;
  if (expectedVersion !== undefined && (current?.version || 0) !== expectedVersion) throw new ContextConflict('配置版本已变化，请刷新后重试');
  const version = (current?.version || 0) + 1;
  const context = await tx.projectIntelligenceContext.upsert({ where: { projectId: ctx.projectId }, create: { projectId: ctx.projectId, version, contentHash }, update: { version, contentHash } });
  await tx.projectContextOutbox.create({ data: { projectId: ctx.projectId, version, contentHash, snapshot: { version, brands, business_preferences }, createdBy: ctx.session.user.id } });
  return context;
}
export async function freezeProjectContext(ctx: GuardContext, expectedVersion: number) {
  return prisma.$transaction(async tx => { await lockContextProject(tx, ctx); return freezeContextInTransaction(tx, ctx, expectedVersion); });
}
export async function deliverProjectContext(ctx: Pick<GuardContext, 'projectId' | 'headers' | 'upstreamUrl'>, limit = 20) {
  const pending = await prisma.projectContextOutbox.findMany({ where: { projectId: ctx.projectId, deliveredAt: null }, orderBy: { version: 'asc' }, take: limit });
  for (const event of pending) {
    const result = await fetchUpstream(ctx, `/api/intelligence/projects/${encodeURIComponent(ctx.projectId)}/brand-context`, { method: 'POST', body: event.snapshot as object, errorMessage: '品牌配置同步尚未确认，可重试已保存的任务' });
    if ('response' in result) return result.response;
    if (!result.data || (result.data as { version?: number }).version !== event.version || (result.data as { content_hash?: unknown }).content_hash !== event.contentHash) throw new ContextConflict('接收回执不匹配，待同步任务已保留');
    await prisma.projectContextOutbox.update({ where: { id: event.id }, data: { deliveredAt: new Date(), nextAttemptAt: null, lastErrorCode: null } });
  }
  return null;
}
