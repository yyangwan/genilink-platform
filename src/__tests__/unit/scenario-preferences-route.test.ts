import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
vi.mock('@/lib/proxy/route-guard', () => ({ resolveGuard: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { projectContextOutbox: { count: vi.fn() }, projectIntelligenceContext: { findUnique: vi.fn() } } }));
vi.mock('@/lib/visibility/project-context', () => ({ ContextConflict: class extends Error {}, deliverProjectContext: vi.fn() }));
vi.mock('@/lib/visibility/business-preferences', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/visibility/business-preferences')>(), setBusinessPreferences: vi.fn() }));
import { resolveGuard } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { deliverProjectContext } from '@/lib/visibility/project-context';
import { parsePreferences, setBusinessPreferences } from '@/lib/visibility/business-preferences';
import { GET, PUT } from '@/app/api/integration/intelligence/preferences/route';
const preferences = { version: 'business-preferences-v1', scenario_importance: { cost: 100 }, reason: '本季度优先核对成本信息' };
const request = (overrides = {}) => new NextRequest('http://localhost/api/integration/intelligence/preferences?projectId=p1', { method: 'PUT', body: JSON.stringify({ projectId: 'p1', expectedVersion: 2, preferences, ...overrides }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveGuard).mockResolvedValue({ ok: true, ctx: { projectId: 'p1', role: 'owner' } } as Awaited<ReturnType<typeof resolveGuard>>);
  vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(0);
  vi.mocked(prisma.projectIntelligenceContext.findUnique).mockResolvedValue(null);
  vi.mocked(setBusinessPreferences).mockResolvedValue({ projectId: 'p1', version: 3, contentHash: 'hash', businessPreferences: preferences } as never);
});
it('reads neutral defaults without generating analysis', async () => {
  const result = await GET(new NextRequest('http://localhost/api/integration/intelligence/preferences?projectId=p1'));
  expect(await result.json()).toMatchObject({ mode: 'neutral', contextVersion: 0 });
  expect(setBusinessPreferences).not.toHaveBeenCalled();
  expect(deliverProjectContext).not.toHaveBeenCalled();
});
it('enforces guard/role and trusted project before persisting', async () => {
  expect((await PUT(request({ projectId: 'other' }))).status).toBe(400);
  vi.mocked(resolveGuard).mockResolvedValue({ ok: true, ctx: { projectId: 'p1', role: 'viewer' } } as Awaited<ReturnType<typeof resolveGuard>>);
  expect((await PUT(request())).status).toBe(403);
  expect(setBusinessPreferences).not.toHaveBeenCalled();
  vi.mocked(resolveGuard).mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 401 }) });
  expect((await GET(new NextRequest('http://localhost/?projectId=p1'))).status).toBe(401);
});
it('returns a durable saved result when receiver delivery is unavailable', async () => {
  vi.mocked(deliverProjectContext).mockRejectedValue(Error('private transport failure'));
  vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(1);
  const result = await PUT(request());
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ saved: true, contextVersion: 3, syncPending: true });
  expect(setBusinessPreferences).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1' }), 2, preferences);
});
it('rejects unknown scenarios, booleans and score-weight overrides', () => {
  expect(parsePreferences({ ...preferences, scenario_importance: { unknown: 100 } })).toBeNull();
  expect(parsePreferences({ ...preferences, scenario_importance: { cost: true } })).toBeNull();
  expect(parsePreferences({ ...preferences, weights: [1, 2] })).toBeNull();
  expect(parsePreferences({ ...preferences, scenario_importance: {} })).toMatchObject({ scenario_importance: {} });
});
