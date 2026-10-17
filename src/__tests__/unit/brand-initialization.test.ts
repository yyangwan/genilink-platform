import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ prisma: { $transaction: vi.fn() } }));
vi.mock('@/lib/billing/access', () => ({ hasBrandCapacity: vi.fn() }));
vi.mock('@/lib/proxy/route-guard', () => ({ fetchUpstream: vi.fn() }));
import { prisma } from '@/lib/db';
import { hasBrandCapacity } from '@/lib/billing/access';
import { createBrandForProject } from '@/lib/brand-helpers';
const tx = { workspaceMember: { findUnique: vi.fn() }, $queryRaw: vi.fn(), brand: { findFirst: vi.fn(), create: vi.fn() }, projectBrand: { upsert: vi.fn(), findMany: vi.fn() }, projectIntelligenceContext: { findUnique: vi.fn(), upsert: vi.fn() }, projectContextOutbox: { create: vi.fn() } };
describe('initial own-brand context', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(prisma.$transaction).mockImplementation(async fn => (fn as unknown as (db: typeof tx) => Promise<unknown>)(tx) as never); tx.workspaceMember.findUnique.mockResolvedValue({ role: 'owner' }); tx.$queryRaw.mockResolvedValue([{ id: 'project' }]); tx.brand.findFirst.mockResolvedValue(null); tx.brand.create.mockResolvedValue({ id: 'brand' }); tx.projectBrand.findMany.mockResolvedValue([]); tx.projectIntelligenceContext.upsert.mockImplementation(async data => data.create); vi.mocked(hasBrandCapacity).mockResolvedValue(true); });
  it('commits the initial own brand, association and durable snapshot together', async () => { expect(await createBrandForProject(' 云衡 ', 'project', 'workspace', 'actor')).toBe(true); expect(tx.brand.create).toHaveBeenCalledWith({ data: { name: '云衡', isCompetitor: false, workspaceId: 'workspace' } }); expect(tx.projectBrand.upsert).toHaveBeenCalledOnce(); expect(tx.projectContextOutbox.create).toHaveBeenCalledOnce(); expect(prisma.$transaction).toHaveBeenCalledOnce(); });
  it('reports quota failure without creating a brand or association', async () => { vi.mocked(hasBrandCapacity).mockResolvedValue(false); expect(await createBrandForProject('云衡', 'project', 'workspace', 'actor')).toBe(false); expect(tx.brand.create).not.toHaveBeenCalled(); expect(tx.projectBrand.upsert).not.toHaveBeenCalled(); });
  it('reuses an existing own brand but will not silently attach a competitor as the own brand', async () => { tx.brand.findFirst.mockResolvedValue({ id: 'own', isCompetitor: false }); expect(await createBrandForProject('云衡', 'project', 'workspace', 'actor')).toBe(true); expect(tx.brand.create).not.toHaveBeenCalled(); tx.projectBrand.upsert.mockClear(); tx.brand.findFirst.mockResolvedValue({ id: 'competitor', isCompetitor: true }); expect(await createBrandForProject('云衡', 'project', 'workspace', 'actor')).toBe(false); expect(tx.projectBrand.upsert).not.toHaveBeenCalled(); });
});
