import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { claimQuickCheck, createVisitor, findVisitor, reportAccess, runQuickCheck } from '@/lib/mini-program/quick-checks';

vi.unmock('@/lib/db');
vi.mock('server-only', () => ({}));

describe.skipIf(process.env.MINI_PROGRAM_TEST_POSTGRES !== 'true')('mini-program quick check with PostgreSQL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('persists one result for a retry and restricts the saved result to its owner', async () => {
    vi.stubEnv('AUTH_SECRET', 'test-only');
    vi.stubEnv('WEBSITE_QUICK_CHECK_SERVICE_URL', 'http://quick-check.test');
    vi.stubEnv('WEBSITE_QUICK_CHECK_SERVICE_SECRET', 'test-only');
    const captured = {
      checkedAt: '2026-11-13T10:30:00Z',
      finalHost: 'example.com',
      ruleVersion: 'website-quick-check-v1',
      checks: ['access', 'content', 'title', 'structured_data'].map((key) => ({ key, status: 'pass', evidence: '公开页面证据' })),
    };
    const upstream = vi.fn(async () => Response.json(captured));
    vi.stubGlobal('fetch', upstream);

    const ip = randomUUID();
    const { visitorToken } = await createVisitor(new Request('http://localhost', { headers: { 'x-real-ip': ip } }), 'community');
    const request = new Request('http://localhost', {
      headers: { 'x-visitor-token': visitorToken!, 'x-real-ip': ip, 'idempotency-key': randomUUID() },
    });
    const visitor = await findVisitor(request);
    expect(visitor?.firstMedium).toBe('community');
    const [owner, other] = await Promise.all([
      prisma.user.create({ data: { name: '快检归属测试' } }),
      prisma.user.create({ data: { name: '快检隔离测试' } }),
    ]);
    try {
      const [first, parallel] = await Promise.all([
        runQuickCheck(request, visitor!, 'https://example.com/'),
        runQuickCheck(request, visitor!, 'https://example.com/?utm_source=test'),
      ]);
      expect(first.report.id).toBe(parallel.report.id);
      expect(upstream).toHaveBeenCalledTimes(1);
      const report = await reportAccess(first.report.id, visitor!.id);
      expect(report.result).toEqual(captured);
      await expect(runQuickCheck(request, visitor!, 'example.org')).rejects.toMatchObject({ status: 409 });
      await expect(claimQuickCheck(report.id, undefined, other.id)).rejects.toMatchObject({ status: 404 });

      const claims = await Promise.allSettled([
        claimQuickCheck(report.id, visitor!.id, owner.id),
        claimQuickCheck(report.id, visitor!.id, other.id),
      ]);
      expect(claims.filter((claim) => claim.status === 'fulfilled')).toHaveLength(1);
      const winner = claims[0].status === 'fulfilled' ? owner.id : other.id;
      const loser = winner === owner.id ? other.id : owner.id;
      await expect(reportAccess(report.id, undefined, winner)).resolves.toMatchObject({ ownerUserId: winner });
      await expect(reportAccess(report.id, visitor!.id)).rejects.toMatchObject({ status: 404 });
      await expect(reportAccess(report.id, visitor!.id, loser)).rejects.toMatchObject({ status: 404 });
      await expect(claimQuickCheck(report.id, undefined, winner)).resolves.toMatchObject({ id: report.id });
    } finally {
      await prisma.funnelEvent.deleteMany({ where: { sessionId: visitor!.id } });
      await prisma.acquisitionSession.delete({ where: { id: visitor!.id } });
      await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    }
  });
});
