import { afterAll, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import type { GuardContext } from '@/lib/proxy/route-guard';
vi.mock('@/lib/proxy/route-guard', () => ({ fetchUpstream: vi.fn() }));
vi.unmock('@/lib/db');
const enabled = process.env.RUN_VALUE_DATABASE_PROOF === '1';
let database: PrismaClient | undefined;
afterAll(async () => { await database?.$disconnect(); });
it.skipIf(!enabled)('locks actual project preferences, preserves receipt history and rejects concurrent stale writers', async () => {
  const url = new URL(process.env.DATABASE_URL || 'invalid:');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/genilink_value') throw Error('Use the explicitly owned loopback value-proof database');
  const { prisma } = await import('@/lib/db'); database = prisma;
  const { freezeProjectContext, ContextConflict } = await import('@/lib/visibility/project-context');
  const { setBusinessPreferences, preferenceView } = await import('@/lib/visibility/business-preferences');
  const workspace = await prisma.workspace.create({ data: { name: 'Synthetic scenario preference proof' } });
  let projectId = '';
  try {
    const project = await prisma.project.create({ data: { name: 'Synthetic context writer proof', workspaceId: workspace.id } }); projectId = project.id;
    const ctx = { projectId, workspaceId: workspace.id, session: { user: { id: 'synthetic-reviewer' } } } as GuardContext;
    const initial = await freezeProjectContext(ctx, 0);
    const preferences = { version: 'business-preferences-v1' as const, scenario_importance: { cost: 100 }, reason: '本季度优先回应成本问题' };
    const saved = await setBusinessPreferences(ctx, initial.version, preferences);
    expect(saved.version).toBe(initial.version + 1);
    expect((await setBusinessPreferences(ctx, initial.version, preferences)).version).toBe(saved.version);
    expect(await prisma.projectContextOutbox.count({ where: { projectId } })).toBe(2);
    await expect(setBusinessPreferences({ ...ctx, workspaceId: 'wrong-workspace' }, saved.version, preferences)).rejects.toBeInstanceOf(ContextConflict);
    const results = await Promise.allSettled([25, 50].map(value => setBusinessPreferences(ctx, saved.version, { ...preferences, scenario_importance: { cost: value } })));
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(row => row.status === 'rejected')).toHaveLength(1);
    const events = await prisma.projectContextOutbox.findMany({ where: { projectId }, orderBy: { version: 'asc' } });
    expect(events).toHaveLength(3);
    expect(events[0].snapshot).toMatchObject({ business_preferences: {} });
    expect(events[1].snapshot).toMatchObject({ business_preferences: preferences });
    const neutral = await setBusinessPreferences(ctx, saved.version + 1, { version: 'business-preferences-v1', scenario_importance: {}, reason: '恢复默认场景等权排序' });
    expect(preferenceView(neutral)).toMatchObject({ mode: 'neutral', reason: '恢复默认场景等权排序' });
  } finally {
    if (projectId) {
      await prisma.projectContextOutbox.deleteMany({ where: { projectId } });
      await prisma.projectIntelligenceContext.deleteMany({ where: { projectId } });
      await prisma.project.delete({ where: { id: projectId } });
    }
    await prisma.workspace.delete({ where: { id: workspace.id } });
  }
});
