import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/auth/sms-providers', () => ({ deliverAliyunSmsTemplate: vi.fn() }));

import {
  BILLING_NOTIFICATION_TYPES,
  buildNotificationSchedule,
  normalizeBillingSmsTime,
  shouldSendBillingNotification,
} from '@/lib/billing/notifications/service';

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    userId: 'user-1',
    status: 'active',
    billingCycle: 'monthly',
    currentPeriodEnd: new Date('2026-09-24T00:00:00.000Z'),
    gracePeriodEnd: null,
    autoRenew: false,
    user: { phone: '+8613800138000', renewalReminderSmsEnabled: true },
    billingPlan: { name: '专业版' },
    ...overrides,
  };
}

describe('billing notification schedule', () => {
  beforeEach(() => vi.clearAllMocks());

  it('schedules monthly due, expiry, and grace-ending notifications', () => {
    const rows = buildNotificationSchedule(
      subscription(),
      new Date('2026-08-24T00:00:00.000Z'),
    );

    expect(rows.map((row) => row.type)).toEqual([
      BILLING_NOTIFICATION_TYPES.renewalDue7d,
      BILLING_NOTIFICATION_TYPES.renewalDue1d,
      BILLING_NOTIFICATION_TYPES.subscriptionExpired,
      BILLING_NOTIFICATION_TYPES.graceEnding,
    ]);
  });

  it('adds a 30-day reminder for yearly subscriptions', () => {
    const rows = buildNotificationSchedule(
      subscription({ billingCycle: 'yearly' }),
      new Date('2026-08-24T00:00:00.000Z'),
    );

    expect(rows[0]?.type).toBe(BILLING_NOTIFICATION_TYPES.renewalDue30d);
  });

  it('disables only optional advance reminders', () => {
    const rows = buildNotificationSchedule(
      subscription({
        user: { phone: '+8613800138000', renewalReminderSmsEnabled: false },
      }),
      new Date('2026-08-24T00:00:00.000Z'),
    );

    expect(rows.map((row) => row.type)).toEqual([
      BILLING_NOTIFICATION_TYPES.subscriptionExpired,
      BILLING_NOTIFICATION_TYPES.graceEnding,
    ]);
  });

  it('does not backfill stale advance reminders after a long scheduler outage', () => {
    const rows = buildNotificationSchedule(
      subscription(),
      new Date('2026-09-22T00:00:00.000Z'),
    );

    expect(rows.map((row) => row.type)).not.toContain(BILLING_NOTIFICATION_TYPES.renewalDue7d);
    expect(rows.map((row) => row.type)).toContain(BILLING_NOTIFICATION_TYPES.renewalDue1d);
  });

  it('does not schedule manual-renewal reminders for auto-renewing subscriptions', () => {
    expect(buildNotificationSchedule(
      subscription({ autoRenew: true }),
      new Date('2026-08-24T00:00:00.000Z'),
    )).toEqual([]);
  });

  it('moves night-time notifications to 09:30 China time', () => {
    expect(normalizeBillingSmsTime(new Date('2026-08-24T14:00:00.000Z')).toISOString())
      .toBe('2026-08-25T01:30:00.000Z');
    expect(normalizeBillingSmsTime(new Date('2026-08-24T02:00:00.000Z')).toISOString())
      .toBe('2026-08-24T02:00:00.000Z');
  });

  it('suppresses queued notifications that became stale during a scheduler outage', () => {
    const now = new Date('2026-09-25T00:00:00.000Z');
    expect(shouldSendBillingNotification({
      type: BILLING_NOTIFICATION_TYPES.subscriptionExpired,
      periodEnd: new Date('2026-09-20T00:00:00.000Z'),
      scheduledAt: new Date('2026-09-20T00:00:00.000Z'),
      subscription: {
        status: 'past_due',
        currentPeriodEnd: new Date('2026-09-20T00:00:00.000Z'),
        gracePeriodEnd: new Date('2026-09-27T00:00:00.000Z'),
        user: { renewalReminderSmsEnabled: true },
      },
    }, now)).toBe(false);
  });

  it('keeps a current due reminder eligible when the preference is enabled', () => {
    const now = new Date('2026-09-25T00:00:00.000Z');
    expect(shouldSendBillingNotification({
      type: BILLING_NOTIFICATION_TYPES.renewalDue1d,
      periodEnd: new Date('2026-09-26T00:00:00.000Z'),
      scheduledAt: new Date('2026-09-24T09:00:00.000Z'),
      subscription: {
        status: 'active',
        currentPeriodEnd: new Date('2026-09-26T00:00:00.000Z'),
        gracePeriodEnd: null,
        user: { renewalReminderSmsEnabled: true },
      },
    }, now)).toBe(true);
  });
});
