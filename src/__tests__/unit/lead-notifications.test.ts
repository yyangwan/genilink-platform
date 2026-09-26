import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findLead: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: {
  leadNotificationDelivery: {
    findMany: mocks.findMany,
    updateMany: mocks.updateMany,
    update: mocks.update,
  },
  marketingLead: { findUnique: mocks.findLead },
} }));
vi.mock('@/lib/auth/service-jwt', () => ({ issueVisibilityProjectJWT: vi.fn() }));

import { deliverLeadNotifications } from '@/lib/marketing/maintenance';

const delivery = {
  id: 'delivery_1', attempts: 0,
  lead: { id: 'lead_1', kind: 'agency', companyName: '示例公司', score: 75, grade: 'hot', contactWithdrawnAt: null },
};

describe('lead notification delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('SALES_LEAD_WEBHOOK_URL', 'https://sales.example.test/leads');
    mocks.findMany.mockResolvedValue([delivery]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.update.mockResolvedValue({});
    mocks.findLead.mockResolvedValue({ contactWithdrawnAt: null });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sends a contact-free payload and marks the delivery complete', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(deliverLeadNotifications(new Date('2026-09-26T00:00:00Z'))).resolves.toEqual({ delivered: 1, failed: 0 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      leadId: 'lead_1', kind: 'agency', companyName: '示例公司', score: 75, grade: 'hot', detailUrl: '/ops/leads/lead_1',
    });
    expect(body).not.toHaveProperty('contact');
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'delivered' }) }));
  });

  it('schedules a retry after a transient webhook failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(deliverLeadNotifications(new Date('2026-09-26T00:00:00Z'))).resolves.toEqual({ delivered: 0, failed: 1 });
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: 'retry', lastError: 'HTTP_503', lockedBy: null, lockedUntil: null,
    }) }));
  });

  it('cancels a claimed delivery when consent was withdrawn concurrently', async () => {
    mocks.findLead.mockResolvedValue({ contactWithdrawnAt: new Date('2026-09-26T00:00:00Z') });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(deliverLeadNotifications()).resolves.toEqual({ delivered: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'canceled', lastError: 'CONTACT_WITHDRAWN' }),
    }));
  });
});
