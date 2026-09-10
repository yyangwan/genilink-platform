import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/billing/access', () => ({
  getWorkspaceBillingAccess: vi.fn().mockResolvedValue({
    limits: { contentGenerationsPerMonth: 10 },
  }),
}));

import { prisma } from '@/lib/db';
import {
  commitUsageOperation,
  markPendingReconcile,
  reconcilePendingUsage,
  releaseUsageOperation,
  reserveContentGeneration,
} from '@/lib/billing/usage-reservations';
import { PlanLimitError } from '@/lib/billing/usage';

const OP = 'content-workflow:ws-1:' + 'a'.repeat(64);
const HASH = 'b'.repeat(64);

describe('reserveContentGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BILLING_DISABLED', '');
    (prisma.$transaction as any).mockImplementation((fn: (tx: unknown) => unknown) =>
      fn(prisma),
    );
  });

  it('inserts a reserved event with TTL and returns reserved', async () => {
    (prisma.usageEvent.findFirst as any).mockResolvedValue(null);
    (prisma.usageEvent.aggregate as any).mockResolvedValue({ _sum: { quantity: 3 } });
    (prisma.usageEvent.create as any).mockResolvedValue({ id: 'ue-1' });

    const result = await reserveContentGeneration({
      userId: 'user-1',
      workspaceId: 'ws-1',
      operationId: OP,
      requestHash: HASH,
    });

    expect(result).toEqual({ type: 'reserved', usageEventId: 'ue-1' });
    const createArgs = (prisma.usageEvent.create as any).mock.calls[0][0].data;
    expect(createArgs.status).toBe('reserved');
    expect(createArgs.operationId).toBe(OP);
    expect(createArgs.requestHash).toBe(HASH);
    expect(createArgs.expiresAt).toBeInstanceOf(Date);
    // 统计排除 released
    expect((prisma.usageEvent.aggregate as any).mock.calls[0][0].where.status).toEqual({
      not: 'released',
    });
  });

  it('replays an existing reservation with the same hash', async () => {
    (prisma.usageEvent.findFirst as any).mockResolvedValue({
      id: 'ue-1',
      status: 'reserved',
      requestHash: HASH,
    });

    const result = await reserveContentGeneration({
      userId: 'user-1',
      workspaceId: 'ws-1',
      operationId: OP,
      requestHash: HASH,
    });
    expect(result).toEqual({ type: 'replay', usageEventId: 'ue-1', status: 'reserved' });
    expect(prisma.usageEvent.create).not.toHaveBeenCalled();
  });

  it('reports conflict for the same operationId with a different hash', async () => {
    (prisma.usageEvent.findFirst as any).mockResolvedValue({
      id: 'ue-1',
      status: 'reserved',
      requestHash: 'c'.repeat(64),
    });

    const result = await reserveContentGeneration({
      userId: 'user-1',
      workspaceId: 'ws-1',
      operationId: OP,
      requestHash: HASH,
    });
    expect(result.type).toBe('conflict');
  });

  it('rejects when the monthly limit is exhausted', async () => {
    (prisma.usageEvent.findFirst as any).mockResolvedValue(null);
    (prisma.usageEvent.aggregate as any).mockResolvedValue({ _sum: { quantity: 10 } });

    const result = await reserveContentGeneration({
      userId: 'user-1',
      workspaceId: 'ws-1',
      operationId: OP,
      requestHash: HASH,
    });
    expect(result.type).toBe('limit');
    if (result.type === 'limit') {
      expect(result.error).toBeInstanceOf(PlanLimitError);
      expect(result.error.statusCode).toBe(402);
    }
    expect(prisma.usageEvent.create).not.toHaveBeenCalled();
  });

  it('retries serialization conflicts (P2034) up to 3 times then succeeds', async () => {
    (prisma.usageEvent.findFirst as any).mockResolvedValue(null);
    (prisma.usageEvent.aggregate as any).mockResolvedValue({ _sum: { quantity: 0 } });
    (prisma.usageEvent.create as any).mockResolvedValue({ id: 'ue-2' });

    let calls = 0;
    (prisma.$transaction as any).mockImplementation(async (fn: (tx: unknown) => unknown) => {
      calls += 1;
      if (calls < 3) {
        const err = new Error('serialization failure') as Error & { code?: string };
        err.code = 'P2034';
      throw err;
      }
      return fn(prisma);
    });

    const result = await reserveContentGeneration({
      userId: 'user-1',
      workspaceId: 'ws-1',
      operationId: OP,
      requestHash: HASH,
    });
    expect(calls).toBe(3);
    expect(result).toEqual({ type: 'reserved', usageEventId: 'ue-2' });
  });

  it('resolves unique constraint races to replay or conflict', async () => {
    (prisma.usageEvent.aggregate as any).mockResolvedValue({ _sum: { quantity: 0 } });
    const uniqueError = Object.assign(new Error('unique'), { code: 'P2002' });
    (prisma.$transaction as any).mockRejectedValue(uniqueError);
    (prisma.usageEvent.findFirst as any).mockResolvedValue({
      id: 'ue-race',
      status: 'reserved',
      requestHash: HASH,
    });

    const result = await reserveContentGeneration({
      userId: 'user-1',
      workspaceId: 'ws-1',
      operationId: OP,
      requestHash: HASH,
    });
    expect(result).toEqual({ type: 'replay', usageEventId: 'ue-race', status: 'reserved' });
  });

  it('no-ops when billing is disabled', async () => {
    vi.stubEnv('BILLING_DISABLED', 'true');
    const result = await reserveContentGeneration({
      userId: 'user-1',
      workspaceId: 'ws-1',
      operationId: OP,
      requestHash: HASH,
    });
    expect(result.type).toBe('disabled');
    expect(prisma.usageEvent.create).not.toHaveBeenCalled();
  });
});

describe('commitUsageOperation / releaseUsageOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BILLING_DISABLED', '');
  });

  it('commits reserved events and is idempotent for already-committed', async () => {
    (prisma.usageEvent.updateMany as any).mockResolvedValueOnce({ count: 1 });
    let result = await commitUsageOperation(OP);
    expect(result).toEqual({ ok: true, status: 'committed', reason: 'ok' });
    expect((prisma.usageEvent.updateMany as any).mock.calls[0][0].where.status).toEqual({
      in: ['reserved', 'pending_reconcile'],
    });

    // 已提交的重复回调
    (prisma.usageEvent.updateMany as any).mockResolvedValueOnce({ count: 0 });
    (prisma.usageEvent.findFirst as any).mockResolvedValue({ status: 'committed' });
    result = await commitUsageOperation(OP);
    expect(result.ok).toBe(true);
  });

  it('refuses to release committed usage', async () => {
    (prisma.usageEvent.updateMany as any).mockResolvedValueOnce({ count: 0 });
    (prisma.usageEvent.findFirst as any).mockResolvedValue({ status: 'committed' });

    const result = await releaseUsageOperation(OP, 'test');
    expect(result).toEqual({
      ok: false,
      status: 'committed',
      reason: 'already-committed',
    });
  });

  it('releases reserved usage with reason metadata', async () => {
    (prisma.usageEvent.updateMany as any).mockResolvedValueOnce({ count: 1 });
    const result = await releaseUsageOperation(OP, 'reconcile:not-found');
    expect(result.ok).toBe(true);
    const args = (prisma.usageEvent.updateMany as any).mock.calls[0][0];
    expect(args.data.status).toBe('released');
    expect(args.data.metadata).toEqual({ releaseReason: 'reconcile:not-found' });
  });

  it('markPendingReconcile only touches reserved events', async () => {
    (prisma.usageEvent.updateMany as any).mockResolvedValueOnce({ count: 1 });
    await markPendingReconcile(OP);
    const args = (prisma.usageEvent.updateMany as any).mock.calls[0][0];
    expect(args.where).toEqual({ operationId: OP, status: 'reserved' });
    expect(args.data.status).toBe('pending_reconcile');
  });
});

describe('reconcilePendingUsage（设计 §12.5 五分支）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BILLING_DISABLED', '');
  });

  function pendingEvent(operationId = OP) {
    return { operationId, status: 'pending_reconcile', createdAt: new Date(), expiresAt: null };
  }

  it('releases when ContentOS reports the workflow missing', async () => {
    (prisma.usageEvent.findMany as any)
      .mockResolvedValueOnce([pendingEvent()])
      .mockResolvedValue([]);
    (prisma.usageEvent.updateMany as any).mockResolvedValueOnce({ count: 1 });

    const decisions = await reconcilePendingUsage({ lookup: async () => ({ found: false }) });
    expect(decisions).toEqual([{ operationId: OP, action: 'released' }]);
  });

  it('commits when ContentOS reports usage committed', async () => {
    (prisma.usageEvent.findMany as any)
      .mockResolvedValueOnce([pendingEvent()])
      .mockResolvedValue([]);
    (prisma.usageEvent.updateMany as any).mockResolvedValueOnce({ count: 1 });

    const decisions = await reconcilePendingUsage({
      lookup: async () => ({ found: true, usageStatus: 'committed', workflowStatus: 'generating' }),
    });
    expect(decisions).toEqual([{ operationId: OP, action: 'committed' }]);
  });

  it('releases when the workflow released its usage', async () => {
    (prisma.usageEvent.findMany as any)
      .mockResolvedValueOnce([pendingEvent()])
      .mockResolvedValue([]);
    (prisma.usageEvent.updateMany as any).mockResolvedValueOnce({ count: 1 });

    const decisions = await reconcilePendingUsage({
      lookup: async () => ({ found: true, usageStatus: 'released', workflowStatus: 'cancelled' }),
    });
    expect(decisions).toEqual([{ operationId: OP, action: 'released' }]);
  });

  it('keeps the reservation when ContentOS is unavailable (never guess-release)', async () => {
    (prisma.usageEvent.findMany as any)
      .mockResolvedValueOnce([pendingEvent()])
      .mockResolvedValue([]);

    const decisions = await reconcilePendingUsage({
      lookup: async () => ({ found: false, unavailable: true }),
    });
    expect(decisions).toEqual([{ operationId: OP, action: 'kept' }]);
    expect(prisma.usageEvent.updateMany).not.toHaveBeenCalled();
  });

  it('keeps the reservation while the workflow is still running', async () => {
    (prisma.usageEvent.findMany as any)
      .mockResolvedValueOnce([pendingEvent()])
      .mockResolvedValue([]);

    const decisions = await reconcilePendingUsage({
      lookup: async () => ({ found: true, usageStatus: 'reserved', workflowStatus: 'generating' }),
    });
    expect(decisions).toEqual([{ operationId: OP, action: 'kept' }]);
  });

  it('flags reservations older than the 30-minute TTL', async () => {
    const stale = new Date(Date.now() - 31 * 60_000);
    (prisma.usageEvent.findMany as any)
      .mockResolvedValueOnce([]) // pending 队列为空
      .mockResolvedValueOnce([{ operationId: OP, createdAt: stale }]);

    const decisions = await reconcilePendingUsage({ lookup: async () => ({ found: false }) });
    expect(decisions).toEqual([{ operationId: OP, action: 'warn-timeout' }]);
  });
});
