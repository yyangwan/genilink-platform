import { describe, expect, it } from 'vitest';
import { filterHistoryRecords, scopeHistoryPayload, suggestionResultLimit } from '@/lib/billing/scope';

describe('billing response scopes', () => {
  const now = new Date('2026-08-22T00:00:00Z');

  it('filters history records to the subscribed retention window', () => {
    const records = [
      { created_at: '2026-08-10T00:00:00Z', score: 80 },
      { created_at: '2026-06-01T00:00:00Z', score: 50 },
    ];

    expect(filterHistoryRecords(records, 30, now)).toEqual([records[0]]);
  });

  it('filters common wrapped history payloads without mutating the input', () => {
    const payload = {
      data: [
        { date: '2026-08-21T00:00:00Z' },
        { date: '2025-01-01T00:00:00Z' },
      ],
      total: 2,
    };

    const scoped = scopeHistoryPayload(payload, 30) as typeof payload;
    expect(scoped.data).toHaveLength(1);
    expect(payload.data).toHaveLength(2);
  });

  it('maps advice levels to visible result limits', () => {
    expect(suggestionResultLimit('basic')).toBe(3);
    expect(suggestionResultLimit('full')).toBe(10);
    expect(suggestionResultLimit('advanced')).toBe(Number.POSITIVE_INFINITY);
  });
});
