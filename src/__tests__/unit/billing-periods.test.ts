import { describe, expect, it } from 'vitest';
import {
  addBillingCycle,
  addGracePeriod,
  nextRetryAt,
  renewalRetrySchedule,
} from '@/lib/billing/periods';
import { computePeriods } from '@/lib/billing/checkout/service';

describe('addBillingCycle', () => {
  it('adds one month for monthly plans (UTC)', () => {
    const result = addBillingCycle(new Date('2026-01-15T08:00:00.000Z'), 'monthly');
    expect(result.toISOString()).toBe('2026-02-15T08:00:00.000Z');
  });

  it('adds one year for yearly plans (leap day overflows to Mar 1 — 365 days)', () => {
    const result = addBillingCycle(new Date('2024-02-29T00:00:00.000Z'), 'yearly');
    // Natural overflow, consistent with the legacy reconcile.ts behavior and
    // the monthly month-end rule pinned above: the period length stays 365d.
    expect(result.toISOString()).toBe('2025-03-01T00:00:00.000Z');
  });

  it('overflows month-end dates naturally (Jan 31 + 1 month = Mar 3)', () => {
    const result = addBillingCycle(new Date('2026-01-31T00:00:00.000Z'), 'monthly');
    expect(result.toISOString()).toBe('2026-03-03T00:00:00.000Z');
  });
});

describe('computePeriods (spec §11.2)', () => {
  const paidAt = new Date('2026-08-22T10:00:00.000Z');

  it('starts a new period at payment time for new purchases', () => {
    const periods = computePeriods({ purchaseType: 'new', paidAt, billingCycle: 'monthly', existingCurrentPeriodEnd: null });
    expect(periods.currentPeriodStart).toEqual(paidAt);
    expect(periods.currentPeriodEnd.toISOString()).toBe('2026-09-22T10:00:00.000Z');
  });

  it('restarts the period at payment time for upgrades without proration (spec §11.3)', () => {
    const periods = computePeriods({
      purchaseType: 'upgrade',
      paidAt,
      billingCycle: 'yearly',
      existingCurrentPeriodEnd: new Date('2026-12-01T00:00:00.000Z'),
    });
    expect(periods.currentPeriodStart).toEqual(paidAt);
    expect(periods.currentPeriodEnd.toISOString()).toBe('2027-08-22T10:00:00.000Z');
  });

  it('extends from the existing period end for manual renewals — never shortens', () => {
    const periods = computePeriods({
      purchaseType: 'manual_renewal',
      paidAt,
      billingCycle: 'monthly',
      existingCurrentPeriodEnd: new Date('2026-09-10T00:00:00.000Z'),
    });
    expect(periods.currentPeriodStart.toISOString()).toBe('2026-09-10T00:00:00.000Z');
    expect(periods.currentPeriodEnd.toISOString()).toBe('2026-10-10T00:00:00.000Z');
  });
});

describe('renewal retry schedule (spec §12.4)', () => {
  const dueAt = new Date('2026-08-22T00:00:00.000Z');

  it('retries on D0, D1 and D3', () => {
    const schedule = renewalRetrySchedule(dueAt);
    expect(schedule.map((slot) => slot.attemptNumber)).toEqual([1, 2, 3]);
    expect(schedule[0].scheduledAt.toISOString()).toBe('2026-08-22T00:00:00.000Z');
    expect(schedule[1].scheduledAt.toISOString()).toBe('2026-08-23T00:00:00.000Z');
    expect(schedule[2].scheduledAt.toISOString()).toBe('2026-08-25T00:00:00.000Z');
  });

  it('returns null after the final attempt', () => {
    expect(nextRetryAt(dueAt, 1)?.toISOString()).toBe('2026-08-23T00:00:00.000Z');
    expect(nextRetryAt(dueAt, 2)?.toISOString()).toBe('2026-08-25T00:00:00.000Z');
    expect(nextRetryAt(dueAt, 3)).toBeNull();
  });
});

describe('grace period (spec §3: 7 days)', () => {
  it('ends 7 days after the period end by default', () => {
    const graceEnd = addGracePeriod(new Date('2026-08-22T00:00:00.000Z'));
    expect(graceEnd.toISOString()).toBe('2026-08-29T00:00:00.000Z');
  });

  it('respects BILLING_GRACE_PERIOD_DAYS', () => {
    process.env.BILLING_GRACE_PERIOD_DAYS = '3';
    try {
      const graceEnd = addGracePeriod(new Date('2026-08-22T00:00:00.000Z'));
      expect(graceEnd.toISOString()).toBe('2026-08-25T00:00:00.000Z');
    } finally {
      delete process.env.BILLING_GRACE_PERIOD_DAYS;
    }
  });
});
