import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
vi.mock('@/lib/proxy/route-guard', () => ({ resolveGuard: vi.fn(), fetchUpstream: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { projectContextOutbox: { count: vi.fn() } } }));
vi.mock('@/lib/visibility/project-context', () => ({ freezeProjectContext: vi.fn(), deliverProjectContext: vi.fn() }));
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { deliverProjectContext, freezeProjectContext } from '@/lib/visibility/project-context';
import { GET, POST } from '@/app/api/integration/intelligence/materials/route';
const assetId = 'a'.repeat(32), factId = 'b'.repeat(32);
const request = (extra: Record<string, unknown> = {}) => new NextRequest('http://localhost/api/integration/intelligence/materials?projectId=p1', { method: 'POST', body: JSON.stringify({ projectId: 'p1', op: 'register', registryBrandId: 'brand1', title: '产品规格', text: '真实材料原文', expectedVersion: 0, idempotencyKey: 'register-material', ...extra }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveGuard).mockResolvedValue({ ok: true, ctx: { projectId: 'p1', role: 'owner' } } as Awaited<ReturnType<typeof resolveGuard>>);
  vi.mocked(fetchUpstream).mockResolvedValue({ data: { id: assetId } });
  vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(0);
  vi.mocked(deliverProjectContext).mockResolvedValue(null);
});
it('reads via the trusted project without initiating context writes or acquisition', async () => {
  await GET(new NextRequest(`http://localhost/?projectId=attacker&op=text&assetId=${assetId}`));
  expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), `/api/intelligence/projects/p1/owned-assets/${assetId}/text`, expect.anything());
  expect(freezeProjectContext).not.toHaveBeenCalled();
  expect((await GET(new NextRequest('http://localhost/?op=text&assetId=../other'))).status).toBe(400);
});
it('rejects project substitution, anonymous/read-only roles and injected source/identity fields', async () => {
  expect((await POST(request({ projectId: 'other' }))).status).toBe(400);
  expect((await POST(request({ entityId: 'injected' }))).status).toBe(400);
  expect((await POST(request({ text_key: 'projects/other/private' }))).status).toBe(400);
  vi.mocked(resolveGuard).mockResolvedValue({ ok: true, ctx: { projectId: 'p1', role: 'viewer' } } as Awaited<ReturnType<typeof resolveGuard>>);
  expect((await POST(request())).status).toBe(403);
  expect(fetchUpstream).not.toHaveBeenCalled();
});
it('mirrors the current server registry before registering and preserves idempotency', async () => {
  expect((await POST(request())).status).toBe(202);
  expect(freezeProjectContext).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1' }));
  expect(deliverProjectContext).toHaveBeenCalled();
  expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), '/api/intelligence/projects/p1/owned-assets', expect.objectContaining({ body: { registryBrandId: 'brand1', title: '产品规格', text: '真实材料原文', expectedVersion: 0, idempotencyKey: 'register-material' } }));
});
it('does not forward material writes while the registry receipt is pending', async () => {
  vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(1);
  expect((await POST(request())).status).toBe(409);
  expect(fetchUpstream).not.toHaveBeenCalled();
  vi.mocked(deliverProjectContext).mockResolvedValue(NextResponse.json({}, { status: 502 }));
  expect((await POST(request())).status).toBe(502);
});
it('routes withdrawal with only the backend contract fields', async () => {
  const req = new NextRequest('http://localhost/?projectId=p1', { method: 'POST', body: JSON.stringify({ projectId: 'p1', op: 'withdrawFact', factId, expectedVersion: 1, reason: '资料更新需要重新核对', idempotencyKey: 'withdraw-owned' }) });
  expect((await POST(req)).status).toBe(202);
  expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), `/api/intelligence/facts/${factId}/withdraw`, expect.objectContaining({ body: { expectedVersion: 1, reason: '资料更新需要重新核对', idempotencyKey: 'withdraw-owned' } }));
});
it('validates Python Unicode offsets and finite, explicit validity windows before approval', async () => {
  const body = { projectId: 'p1', op: 'approveFact', assetId, expectedVersion: 0, expectedVerificationVersion: 1,
    quote: '云衡支持门店', start: 1, end: 7, materialHash: 'f'.repeat(64), scope: '专业版产品限定范围', reason: '产品负责人核对规格', validFrom: '2026-10-25T00:00:00Z', validUntil: '2026-11-25T00:00:00Z', idempotencyKey: 'approve-owned' };
  const call = (change = {}) => POST(new NextRequest('http://localhost/?projectId=p1', { method: 'POST', body: JSON.stringify({ ...body, ...change }) }));
  expect((await call({ start: true })).status).toBe(400);
  expect((await call({ validUntil: 'unknown' })).status).toBe(400);
  expect((await call({ expectedVerificationVersion: 0 })).status).toBe(400);
  expect((await call()).status).toBe(202);
});
