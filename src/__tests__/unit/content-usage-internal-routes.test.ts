import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/content/contentos-internal-client', () => ({
  lookupWorkflowByOperation: vi.fn(),
}));

import { lookupWorkflowByOperation } from '@/lib/content/contentos-internal-client';
import { prisma } from '@/lib/db';
import { POST as commitRoute } from '@/app/api/internal/content-usage/operations/[operationId]/commit/route';
import { POST as releaseRoute } from '@/app/api/internal/content-usage/operations/[operationId]/release/route';
import { POST as reconcileRoute } from '@/app/api/internal/content-usage/reconcile/route';

const OP = 'content-workflow:ws-1:' + 'a'.repeat(64);
const SECRET = 'shared-secret-1';

function req(path: string, headers: Record<string, string> = {}, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('internal content-usage routes auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BILLING_DISABLED', '');
  });

  it('returns 503 when the shared secret is not configured', async () => {
    vi.stubEnv('CONTENT_USAGE_CALLBACK_SECRET', '');
    const res = await commitRoute(req(`/api/internal/content-usage/operations/${OP}/commit`), {
      params: Promise.resolve({ operationId: OP }),
    });
    expect(res.status).toBe(503);
  });

  it('returns 401 on wrong credentials', async () => {
    vi.stubEnv('CONTENT_USAGE_CALLBACK_SECRET', SECRET);
    const res = await commitRoute(
      req(`/api/internal/content-usage/operations/${OP}/commit`, { authorization: 'Bearer wrong' }),
      { params: Promise.resolve({ operationId: OP }) },
    );
    expect(res.status).toBe(401);
  });
});

describe('POST .../commit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BILLING_DISABLED', '');
    vi.stubEnv('CONTENT_USAGE_CALLBACK_SECRET', SECRET);
  });

  it('commits and returns the new status', async () => {
    (prisma.usageEvent.updateMany as any).mockResolvedValueOnce({ count: 1 });
    const res = await commitRoute(
      req(`/api/internal/content-usage/operations/${OP}/commit`, {
        authorization: `Bearer ${SECRET}`,
      }),
      { params: Promise.resolve({ operationId: OP }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ operationId: OP, status: 'committed' });
  });

  it('is idempotent when already committed', async () => {
    (prisma.usageEvent.updateMany as any).mockResolvedValueOnce({ count: 0 });
    (prisma.usageEvent.findFirst as any).mockResolvedValue({ status: 'committed' });
    const res = await commitRoute(
      req(`/api/internal/content-usage/operations/${OP}/commit`, {
        authorization: `Bearer ${SECRET}`,
      }),
      { params: Promise.resolve({ operationId: OP }) },
    );
    expect(res.status).toBe(200);
  });

  it('returns 404 when the reservation does not exist', async () => {
    (prisma.usageEvent.updateMany as any).mockResolvedValueOnce({ count: 0 });
    (prisma.usageEvent.findFirst as any).mockResolvedValue(null);
    const res = await commitRoute(
      req(`/api/internal/content-usage/operations/${OP}/commit`, {
        authorization: `Bearer ${SECRET}`,
      }),
      { params: Promise.resolve({ operationId: OP }) },
    );
    expect(res.status).toBe(404);
  });
});

describe('POST .../release', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BILLING_DISABLED', '');
    vi.stubEnv('CONTENT_USAGE_CALLBACK_SECRET', SECRET);
  });

  it('releases with a reason body', async () => {
    (prisma.usageEvent.updateMany as any).mockResolvedValueOnce({ count: 1 });
    const res = await releaseRoute(
      req(
        `/api/internal/content-usage/operations/${OP}/release`,
        { authorization: `Bearer ${SECRET}` },
        { reason: 'cancelled' },
      ),
      { params: Promise.resolve({ operationId: OP }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe('released');
  });

  it('returns 409 when usage is already committed', async () => {
    (prisma.usageEvent.updateMany as any).mockResolvedValueOnce({ count: 0 });
    (prisma.usageEvent.findFirst as any).mockResolvedValue({ status: 'committed' });
    const res = await releaseRoute(
      req(`/api/internal/content-usage/operations/${OP}/release`, {
        authorization: `Bearer ${SECRET}`,
      }),
      { params: Promise.resolve({ operationId: OP }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('USAGE_ALREADY_COMMITTED');
  });
});

describe('POST /api/internal/content-usage/reconcile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BILLING_DISABLED', '');
    vi.stubEnv('BILLING_CRON_SECRET', 'cron-1');
  });

  it('requires BILLING_CRON_SECRET', async () => {
    vi.stubEnv('BILLING_CRON_SECRET', '');
    const res = await reconcileRoute(req('/api/internal/content-usage/reconcile'));
    expect(res.status).toBe(503);
  });

  it('runs reconciliation and reports decisions', async () => {
    (prisma.usageEvent.findMany as any).mockResolvedValue([]);
    const res = await reconcileRoute(
      req('/api/internal/content-usage/reconcile', { authorization: 'Bearer cron-1' }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.processed).toBe(0);
    expect(lookupWorkflowByOperation).not.toHaveBeenCalled();
  });
});
