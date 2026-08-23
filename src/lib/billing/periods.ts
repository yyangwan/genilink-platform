// Billing period math and renewal retry scheduling (spec §3, §12.4).
// All dates are UTC; UI renders Asia/Shanghai.

import type { BillingCycle } from '@/types/billing';

export const GRACE_PERIOD_DAYS_DEFAULT = 7;
export const RENEWAL_RETRY_DELAYS_DAYS = [0, 1, 3] as const;
export const RENEWAL_MAX_ATTEMPTS = RENEWAL_RETRY_DELAYS_DAYS.length;

export function gracePeriodDays(): number {
  const raw = Number(process.env.BILLING_GRACE_PERIOD_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : GRACE_PERIOD_DAYS_DEFAULT;
}

export function checkoutTtlMinutes(): number {
  const raw = Number(process.env.BILLING_CHECKOUT_TTL_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 30;
}

/**
 * Add one billing cycle to a date (UTC). Month-end dates overflow naturally
 * (Jan 31 + 1 month -> Mar 3), matching the legacy reconcile.ts behavior —
 * pinned by unit tests.
 */
export function addBillingCycle(from: Date, billingCycle: BillingCycle | string): Date {
  const result = new Date(from.getTime());
  if (billingCycle === 'yearly') {
    result.setUTCFullYear(result.getUTCFullYear() + 1);
  } else {
    result.setUTCMonth(result.getUTCMonth() + 1);
  }
  return result;
}

/** Grace period end: period end + N days (spec §3: 7 days default). */
export function addGracePeriod(periodEnd: Date, days = gracePeriodDays()): Date {
  const result = new Date(periodEnd.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function addDays(from: Date, days: number): Date {
  const result = new Date(from.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export type RenewalRetrySlot = {
  attemptNumber: number;
  scheduledAt: Date;
};

/**
 * Renewal retry schedule anchored at the subscription due date:
 * attempt 1 on the due day (D0), attempt 2 on D1, attempt 3 on D3 (spec §12.4).
 */
export function renewalRetrySchedule(dueAt: Date): RenewalRetrySlot[] {
  return RENEWAL_RETRY_DELAYS_DAYS.map((delayDays, index) => ({
    attemptNumber: index + 1,
    scheduledAt: addDays(dueAt, delayDays),
  }));
}

/** Next retry time after a failed attempt (D0 -> D1 -> D3; null after final attempt). */
export function nextRetryAt(dueAt: Date, failedAttemptNumber: number): Date | null {
  if (failedAttemptNumber >= RENEWAL_MAX_ATTEMPTS) return null;
  return renewalRetrySchedule(dueAt)[failedAttemptNumber]?.scheduledAt ?? null;
}
