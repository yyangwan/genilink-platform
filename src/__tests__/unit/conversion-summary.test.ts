import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { funnelDailyMetric: { findMany: mocks.findMany } } }));

import { getConversionSummary } from '@/lib/marketing/conversion';

describe('conversion summary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aggregates totals and channel rows while ignoring unknown events', async () => {
    mocks.findMany.mockResolvedValue([
      { eventName: 'diagnosis_intent_created', source: 'baidu', medium: 'cpc', campaign: 'launch', eventCount: 8 },
      { eventName: 'diagnosis_completed', source: 'baidu', medium: 'cpc', campaign: 'launch', eventCount: 3 },
      { eventName: 'future_event', source: 'baidu', medium: 'cpc', campaign: 'launch', eventCount: 99 },
    ]);
    const result = await getConversionSummary(30, new Date('2026-09-26T12:00:00Z'));
    expect(result.totals.diagnosis_intent_created).toBe(8);
    expect(result.totals.diagnosis_completed).toBe(3);
    expect(result.channels[0]).toMatchObject({ source: 'baidu', medium: 'cpc', campaign: 'launch' });
    expect(result.start).toEqual(new Date('2026-08-27T00:00:00Z'));
    expect(result.end).toEqual(new Date('2026-09-26T00:00:00Z'));
  });

  it('caps the requested range at 90 days', async () => {
    mocks.findMany.mockResolvedValue([]);
    await expect(getConversionSummary(365)).resolves.toMatchObject({ days: 90 });
  });
});
