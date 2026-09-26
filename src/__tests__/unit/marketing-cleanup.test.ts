import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteIntents: vi.fn(), deleteEvents: vi.fn(), deleteRateLimits: vi.fn(), deleteSessions: vi.fn(), transaction: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ prisma: {
  acquisitionIntent: { deleteMany: mocks.deleteIntents },
  funnelEvent: { deleteMany: mocks.deleteEvents },
  credentialRateLimitBucket: { deleteMany: mocks.deleteRateLimits },
  acquisitionSession: { deleteMany: mocks.deleteSessions },
  $transaction: mocks.transaction,
} }));
vi.mock('@/lib/auth/service-jwt', () => ({ issueVisibilityProjectJWT: vi.fn() }));

import { cleanupMarketingData } from '@/lib/marketing/maintenance';

describe('marketing data cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.deleteIntents.mockReturnValue('intents-query');
    mocks.deleteEvents.mockReturnValue('events-query');
    mocks.deleteRateLimits.mockReturnValue('limits-query');
    mocks.transaction.mockResolvedValue([{ count: 2 }, { count: 3 }, { count: 4 }]);
    mocks.deleteSessions.mockResolvedValue({ count: 1 });
  });

  it('deletes only expired terminal intents, retained raw events and unreferenced sessions', async () => {
    const now = new Date('2026-09-26T00:00:00Z');
    const result = await cleanupMarketingData(now);
    expect(result.deleted).toEqual({ intents: 2, events: 3, rateLimits: 4, sessions: 1 });
    expect(result.eventCutoff).toEqual(new Date('2026-06-28T00:00:00Z'));
    expect(mocks.deleteIntents).toHaveBeenCalledWith({ where: {
      expiresAt: { lt: now }, status: { in: ['pending', 'completed', 'failed'] },
    } });
    expect(mocks.deleteSessions).toHaveBeenCalledWith({ where: expect.objectContaining({
      intents: { none: {} }, leads: { none: {} }, checkoutSessions: { none: {} }, paymentOrders: { none: {} },
    }) });
  });

  it('falls back to 90 days when the configured retention is unsafe', async () => {
    vi.stubEnv('MARKETING_EVENT_RETENTION_DAYS', '7');
    const result = await cleanupMarketingData(new Date('2026-09-26T00:00:00Z'));
    expect(result.eventCutoff).toEqual(new Date('2026-06-28T00:00:00Z'));
  });
});
