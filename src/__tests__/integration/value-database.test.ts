import { afterAll, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import type { PrismaClient } from '@/generated/prisma/client';
import type { GuardContext } from '@/lib/proxy/route-guard';

// This test exercises the actual SQL/outbox transaction, never a remote service.
vi.mock('@/lib/proxy/route-guard', () => ({ fetchUpstream: vi.fn() }));
vi.unmock('@/lib/db');
const enabled = process.env.RUN_VALUE_DATABASE_PROOF === '1';
let database: PrismaClient | undefined;
afterAll(async () => { await database?.$disconnect(); });

it.skipIf(!enabled)('initializes neutral preferences and signs a new durable context when business importance changes', async () => {
  const url = new URL(process.env.DATABASE_URL || 'invalid:');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/genilink_value') throw Error('Use the explicitly owned loopback value-proof database');
  const { prisma } = await import('@/lib/db');
  const { lockContextProject, freezeContextInTransaction, ContextConflict } = await import('@/lib/visibility/project-context');
  database = prisma;
  const initial = await prisma.workspace.count();
  const receipts: Array<{ project_id: string; content_hash: string; snapshot: unknown }> = [];
  class RollbackProof extends Error {}
  try {
    await prisma.$transaction(async tx => {
      const workspace = await tx.workspace.create({ data: { name: 'Synthetic value-schema proof' } });
      const project = await tx.project.create({ data: { name: 'Synthetic project', workspaceId: workspace.id } });
      const brand = await tx.brand.create({ data: { name: '云衡', aliases: ['Yunheng'], workspaceId: workspace.id } });
      await tx.projectBrand.create({ data: { projectId: project.id, brandId: brand.id } });
      const ctx = { projectId: project.id, workspaceId: workspace.id, session: { user: { id: 'synthetic-reviewer' } } } as GuardContext;
      await lockContextProject(tx, ctx);
      await expect(lockContextProject(tx, { ...ctx, workspaceId: 'other-workspace' })).rejects.toBeInstanceOf(ContextConflict);
      const first = await freezeContextInTransaction(tx, ctx, 0);
      expect(first.version).toBe(1);
      const preferences = { version: 'business-preferences-v1', scenario_importance: { cost: 80, implementation: 50 }, reason: '优先回应报价范围及实施条件' };
      await tx.projectIntelligenceContext.update({ where: { projectId: project.id }, data: { businessPreferences: preferences } });
      const second = await freezeContextInTransaction(tx, ctx, 1);
      expect(second.version).toBe(2);
      expect(second.contentHash).not.toBe(first.contentHash);
      const events = await tx.projectContextOutbox.findMany({ where: { projectId: project.id }, orderBy: { version: 'asc' } });
      expect(events).toHaveLength(2);
      expect(events[0].snapshot).toMatchObject({ version: 1, business_preferences: {} });
      expect(events[1].snapshot).toMatchObject({ version: 2, business_preferences: preferences });
      receipts.push(...events.map(event => ({ project_id: project.id, content_hash: event.contentHash, snapshot: event.snapshot })));
      throw new RollbackProof();
    });
  } catch (error) { if (!(error instanceof RollbackProof)) throw error; }
  expect(await prisma.workspace.count()).toBe(initial);
  if (process.env.VALUE_RECEIPT_OUTPUT) await writeFile(process.env.VALUE_RECEIPT_OUTPUT, JSON.stringify(receipts), { encoding: 'utf8' });
});
