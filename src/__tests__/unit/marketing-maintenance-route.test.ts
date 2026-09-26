import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
}));

vi.mock('@/lib/marketing/maintenance', () => ({ runMarketingMaintenance: mocks.run }));

import { POST } from '@/app/api/internal/marketing/maintenance/route';

describe('POST /api/internal/marketing/maintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('MARKETING_CRON_SECRET', 'marketing-secret');
    mocks.run.mockResolvedValue({
      reconciliation: { decisions: [], unresolved: 0 },
      aggregation: { start: new Date('2026-09-24'), end: new Date('2026-09-25'), groups: 0 },
      notifications: { delivered: 0, failed: 0 },
      cleanup: { eventCutoff: new Date('2026-06-27'), deleted: { intents: 0, events: 0, rateLimits: 0, sessions: 0 } },
    });
  });

  it('rejects requests without the marketing cron secret', async () => {
    const response = await POST(new NextRequest('http://localhost/api/internal/marketing/maintenance', { method: 'POST' }));
    expect(response.status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('runs reconciliation and aggregation with valid authentication', async () => {
    const response = await POST(new NextRequest('http://localhost/api/internal/marketing/maintenance', {
      method: 'POST',
      headers: { authorization: 'Bearer marketing-secret' },
    }));
    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });

  it('honors the independent marketing jobs switch', async () => {
    vi.stubEnv('MARKETING_JOBS_ENABLED', 'false');
    const response = await POST(new NextRequest('http://localhost/api/internal/marketing/maintenance', {
      method: 'POST',
      headers: { authorization: 'Bearer marketing-secret' },
    }));
    expect(response.status).toBe(503);
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
