import type { CapabilityLevel } from '@/lib/billing/tiers';

const DATE_KEYS = ['date', 'created_at', 'createdAt', 'started_at', 'startedAt', 'completed_at', 'completedAt'] as const;

function recordDate(record: Record<string, unknown>): Date | null {
  for (const key of DATE_KEYS) {
    const value = record[key];
    if (typeof value !== 'string') continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

export function filterHistoryRecords<T extends Record<string, unknown>>(
  records: T[],
  historyDays: number,
  now = new Date(),
): T[] {
  if (historyDays <= 0) return [];
  const cutoff = new Date(now.getTime() - historyDays * 24 * 60 * 60 * 1000);
  return records.filter((record) => {
    const date = recordDate(record);
    return !date || date >= cutoff;
  });
}

export function scopeHistoryPayload(payload: unknown, historyDays: number): unknown {
  if (Array.isArray(payload)) {
    return filterHistoryRecords(payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')), historyDays);
  }
  if (!payload || typeof payload !== 'object') return payload;

  const record = { ...(payload as Record<string, unknown>) };
  for (const key of ['data', 'audits', 'history', 'items']) {
    const value = record[key];
    if (Array.isArray(value)) {
      record[key] = filterHistoryRecords(
        value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')),
        historyDays,
      );
    }
  }
  return record;
}

export function suggestionResultLimit(level: CapabilityLevel): number {
  if (level === 'basic') return 3;
  if (level === 'full') return 10;
  return Number.POSITIVE_INFINITY;
}
