import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const stateful = vi.hoisted(() => ({ current: null as any }));

vi.mock('@/lib/db', () => {
  const MODELS = [
    'user', 'workspace', 'workspaceMember', 'project', 'wechatLoginSession',
    'subscription', 'billingPlan', 'paymentOrder', 'paymentEvent',
    'checkoutSession', 'promotion', 'coupon', 'couponRedemption',
    'paymentAgreement', 'renewalAttempt',
  ];
  const METHODS = ['$transaction', '$queryRaw', '$executeRaw'];
  const prisma: Record<string, unknown> = {};
  for (const model of MODELS) {
    prisma[model] = new Proxy(
      {},
      {
        get(_t, method: string) {
          return (...args: unknown[]) => stateful.current![model][method](...args);
        },
      },
    );
  }
  for (const method of METHODS) {
    prisma[method] = (...args: unknown[]) => (stateful.current![method] as (...a: unknown[]) => unknown)(...args);
  }
  return { prisma };
});

import {
  ensureRenewalAttempts,
  executeRenewalAttempt,
  expireGracePeriods,
  listDueSubscriptions,
  reconcileRenewalPayment,
  renewalIdempotencyKey,
  type RenewalAttemptRecord,
} from '@/lib/billing/renewals/service';

// ─── Stateful fake ───────────────────────────────────────────────────────────

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (condition instanceof Date) {
      return row[key] instanceof Date && row[key].getTime() === condition.getTime();
    }
    if (condition && typeof condition === 'object' && !Array.isArray(condition) && (condition as Row).constructor === Object) {
      const filter = condition as Row;
      if ('in' in filter) return (filter.in as unknown[]).includes(row[key]);
      if ('lt' in filter) return row[key] < filter.lt;
      if ('lte' in filter) return row[key] <= filter.lte;
      if ('gt' in filter) return row[key] > filter.gt;
      return false;
    }
    if (key.includes('_')) return true; // composite keys handled explicitly
    return row[key] === condition;
  });
}

function createDb(seed: { subscriptions?: Row[]; attempts?: Row[]; agreements?: Row[]; orders?: Row[] } = {}) {
  const db = {
    subscriptions: seed.subscriptions ?? [],
    attempts: seed.attempts ?? [],
    orders: (seed.orders ?? []) as Row[],
    agreements: seed.agreements ?? [],
    events: [] as Row[],
    sessions: [] as Row[],
  };

  const updateRow = (list: Row[], where: Row, data: Row): Row | null => {
    const index = list.findIndex((row) => matches(row, where));
    if (index === -1) return null;
    list[index] = { ...list[index], ...data };
    return list[index];
  };
  const updateMany = (list: Row[], where: Row, data: Row) => {
    let count = 0;
    list.forEach((row, index) => {
      if (matches(row, where)) {
        list[index] = { ...row, ...data };
        count += 1;
      }
    });
    return { count };
  };

  return {
    db,
    subscription: {
      findMany: async ({ where }: any) => {
        const { paymentAgreement: agreementFilter, ...rest } = where ?? {};
        return db.subscriptions
          .filter((row) => matches(row, rest))
          .filter((row) => {
            if (!agreementFilter) return true;
            const agreement = db.agreements.find((a) => a.id === row.paymentAgreementId);
            return agreement ? matches(agreement, agreementFilter) : false;
          })
          .map((row) => ({ ...row, paymentAgreement: row.paymentAgreementId ? db.agreements.find((a) => a.id === row.paymentAgreementId) : null }));
      },
      findUnique: async ({ where }: any) => db.subscriptions.find((row) => matches(row, where)) ?? null,
      findFirst: async ({ where }: any) => db.subscriptions.find((row) => matches(row, where)) ?? null,
      update: async ({ where, data }: any) => {
        const row = updateRow(db.subscriptions, where, data);
        if (!row) throw new Error('subscription not found');
        return row;
      },
      updateMany: async ({ where, data }: any) => updateMany(db.subscriptions, where, data),
    },
    renewalAttempt: {
      findUnique: async ({ where }: any) => db.attempts.find((row) => matches(row, where)) ?? null,
      findFirst: async ({ where }: any, _opts?: any) =>
        [...db.attempts].filter((row) => matches(row, where)).sort((a, b) => b.attemptNumber - a.attemptNumber)[0] ?? null,
      findMany: async ({ where }: any) => db.attempts.filter((row) => matches(row, where)),
      create: async ({ data }: any) => {
        const row = { id: `attempt-${db.attempts.length + 1}`, ...data };
        db.attempts.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = updateRow(db.attempts, where, data);
        if (!row) throw new Error('attempt not found');
        return row;
      },
      updateMany: async ({ where, data }: any) => updateMany(db.attempts, where, data),
    },
    paymentOrder: {
      findUnique: async ({ where }: any) => {
        const order = db.orders.find((row) => matches(row, where));
        if (!order) return null;
        return {
          ...order,
          renewalAttempt: order.orderType === 'renewal'
            ? {
                ...db.attempts.find((a) => a.paymentOrderId === order.id),
                subscription: db.subscriptions.find((s) => s.id === db.attempts.find((a) => a.paymentOrderId === order.id)?.subscriptionId),
              }
            : null,
        };
      },
      create: async ({ data }: any) => {
        const row = { id: `order-${db.orders.length + 1}`, ...data };
        db.orders.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = updateRow(db.orders, where, data);
        if (!row) throw new Error('order not found');
        return row;
      },
      count: async () => 0,
    },
    paymentAgreement: {
      findUnique: async ({ where }: any) => db.agreements.find((row) => matches(row, where)) ?? null,
      update: async ({ where, data }: any) => updateRow(db.agreements, where, data),
    },
    paymentEvent: {
      update: async ({ where }: any) => {
        if (!db.events.find((row) => matches(row, where))) {
          throw new Error('event not found'); // swallowed by markEvent catch
        }
        return updateRow(db.events, where, { processedAt: new Date() })!;
      },
    },
    checkoutSession: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    couponRedemption: { count: async () => 0, updateMany: async () => ({ count: 0 }) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(stateful.current),
    $queryRaw: async () => [],
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PERIOD_START = new Date('2026-09-01T00:00:00.000Z');
const PERIOD_END = new Date('2027-09-01T00:00:00.000Z'); // yearly
const NOW_PAST_DUE = new Date('2026-09-01T00:05:00.000Z');

function seedSubscription(overrides: Row = {}) {
  return {
    id: 'sub-1',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    module: 'suite',
    status: 'active',
    billingCycle: 'yearly',
    billingPlanId: 'plan-1',
    provider: 'wechatpay',
    autoRenew: true,
    cancelAtPeriodEnd: false,
    paymentAgreementId: 'agr-1',
    nextBillingAt: PERIOD_START,
    currentPeriodStart: new Date('2025-09-01T00:00:00.000Z'),
    currentPeriodEnd: PERIOD_START,
    gracePeriodEnd: null,
    renewalPriceCents: 399900,
    priceSnapshot: { key: 'suite-pro-yearly' },
    discountSnapshot: { discountCents: 79980, duration: 'repeating', durationCycles: 3 },
    discountRemainingCycles: 2,
    ...overrides,
  };
}

function seedAttempt(overrides: Row = {}): RenewalAttemptRecord {
  return {
    id: 'attempt-1',
    subscriptionId: 'sub-1',
    paymentOrderId: null,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    scheduledAt: PERIOD_START,
    attemptNumber: 1,
    amountCents: 319920,
    currency: 'CNY',
    status: 'processing',
    failureCode: null,
    failureMessage: null,
    nextRetryAt: null,
    lockedBy: 'worker-1',
    lockedUntil: new Date(NOW_PAST_DUE.getTime() + 5 * 60_000),
    startedAt: NOW_PAST_DUE,
    completedAt: null,
    paymentOrder: null,
    ...overrides,
    subscription: seedSubscription(overrides.subscription ?? {}),
  } as RenewalAttemptRecord;
}

function baseAttemptRow(overrides: Row = {}): Row {
  return {
    id: 'attempt-1',
    subscriptionId: 'sub-1',
    paymentOrderId: null,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    scheduledAt: PERIOD_START,
    attemptNumber: 1,
    amountCents: 319920,
    currency: 'CNY',
    status: 'processing',
    failureCode: null,
    failureMessage: null,
    nextRetryAt: null,
    lockedBy: 'worker-1',
    lockedUntil: new Date(NOW_PAST_DUE.getTime() + 5 * 60_000),
    startedAt: NOW_PAST_DUE,
    completedAt: null,
    ...overrides,
  };
}

const ACTIVE_AGREEMENT = {
  id: 'agr-1',
  provider: 'wechatpay',
  status: 'active',
  providerAgreementId: 'wx-agr-1',
};

function chargeAdapter(result: Partial<{ outcome: 'succeeded' | 'pending' | 'failed'; retryable: boolean; providerTransactionId: string; failureCode: string; failureMessage: string }>) {
  return { chargeAgreement: vi.fn(async () => result as never) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW_PAST_DUE);
});

describe('renewalIdempotencyKey (spec §12.3)', () => {
  it('formats renewal:{subscriptionId}:{periodStart}:{attemptNumber}', () => {
    expect(renewalIdempotencyKey('sub-1', PERIOD_START, 2)).toBe(
      `renewal:sub-1:${PERIOD_START.toISOString()}:2`,
    );
  });
});

describe('listDueSubscriptions (spec §12.2)', () => {
  it('selects only auto-renewing subscriptions with an active agreement', async () => {
    vi.useRealTimers();
    stateful.current = createDb({
      subscriptions: [
        seedSubscription(), // due
        seedSubscription({ id: 'sub-2', autoRenew: false }), // auto-renew off
        seedSubscription({ id: 'sub-3', cancelAtPeriodEnd: true }), // cancel pending
        seedSubscription({ id: 'sub-4', status: 'expired' }), // terminal
        seedSubscription({ id: 'sub-5', nextBillingAt: new Date('2026-10-01T00:00:00.000Z') }), // not yet due
        seedSubscription({ id: 'sub-6', paymentAgreementId: 'agr-dead' }), // agreement not active
      ],
      agreements: [ACTIVE_AGREEMENT, { ...ACTIVE_AGREEMENT, id: 'agr-dead', status: 'revoked' }],
    });

    const due = await listDueSubscriptions(NOW_PAST_DUE);
    expect(due.map((row: Row) => row.id)).toEqual(['sub-1']);
  });
});

describe('ensureRenewalAttempts', () => {
  it('creates attempt 1 for a due subscription using snapshot pricing (spec §7.6)', async () => {
    vi.useRealTimers();
    stateful.current = createDb({
      subscriptions: [seedSubscription()],
      agreements: [ACTIVE_AGREEMENT],
    });

    const created = await ensureRenewalAttempts(NOW_PAST_DUE);
    expect(created).toBe(1);
    const attempt = stateful.current.db.attempts[0];
    expect(attempt.attemptNumber).toBe(1);
    expect(attempt.amountCents).toBe(319920); // 399900 - 79980 snapshot discount
    expect(attempt.periodStart.toISOString()).toBe(PERIOD_START.toISOString());
    expect(attempt.status).toBe('scheduled');
  });

  it('schedules the retry attempt only after nextRetryAt arrives (D1, spec §12.4)', async () => {
    vi.useRealTimers();
    const nextRetryAt = new Date('2026-09-02T00:00:00.000Z');
    stateful.current = createDb({
      subscriptions: [seedSubscription({ nextBillingAt: PERIOD_START })],
      agreements: [ACTIVE_AGREEMENT],
      attempts: [
        {
          id: 'attempt-1',
          subscriptionId: 'sub-1',
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          attemptNumber: 1,
          status: 'retryable_failed',
          nextRetryAt,
        },
      ],
    });

    // Before the retry time: nothing new.
    expect(await ensureRenewalAttempts(new Date('2026-09-01T12:00:00.000Z'))).toBe(0);

    // After the retry time: attempt 2 is scheduled at exactly nextRetryAt.
    expect(await ensureRenewalAttempts(new Date('2026-09-02T00:01:00.000Z'))).toBe(1);
    const retry = stateful.current.db.attempts.find((a: Row) => a.attemptNumber === 2);
    expect(retry.status).toBe('scheduled');
    expect(retry.scheduledAt.toISOString()).toBe(nextRetryAt.toISOString());

    // No attempt 4 after the final failure.
    stateful.current.db.attempts[1].status = 'retryable_failed';
    stateful.current.db.attempts[1].attemptNumber = 3;
    stateful.current.db.attempts[1].nextRetryAt = new Date('2026-09-04T00:00:00.000Z');
    expect(await ensureRenewalAttempts(new Date('2026-09-04T00:01:00.000Z'))).toBe(0);
  });
});

describe('executeRenewalAttempt', () => {
  it('extends from the original period end and decrements discount cycles on success (spec §12.5)', async () => {
    stateful.current = createDb({
      subscriptions: [seedSubscription()],
      agreements: [ACTIVE_AGREEMENT],
      attempts: [baseAttemptRow()],
    });

    const outcome = await executeRenewalAttempt(seedAttempt(), {
      adapterOverride: chargeAdapter({ outcome: 'succeeded', providerTransactionId: 'wx-txn-9' }),
    });

    expect(outcome).toBe('succeeded');
    const { db } = stateful.current;
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0].status).toBe('paid');
    expect(db.orders[0].orderType).toBe('renewal');
    expect(db.orders[0].idempotencyKey).toBe(renewalIdempotencyKey('sub-1', PERIOD_START, 1));

    const attempt = db.attempts[0];
    expect(attempt.status).toBe('succeeded');
    expect(attempt.paymentOrderId).toBe(db.orders[0].id);

    const subscription = db.subscriptions[0];
    expect(subscription.status).toBe('active');
    expect(subscription.currentPeriodStart.toISOString()).toBe(PERIOD_START.toISOString());
    expect(subscription.currentPeriodEnd.toISOString()).toBe(PERIOD_END.toISOString());
    expect(subscription.nextBillingAt.toISOString()).toBe(PERIOD_END.toISOString());
    expect(subscription.gracePeriodEnd).toBeNull();
    expect(subscription.discountRemainingCycles).toBe(1); // 2 -> 1 (only on success)
  });

  it('marks past_due with a 7-day grace window on retryable failure (spec §12.4)', async () => {
    stateful.current = createDb({
      subscriptions: [seedSubscription()],
      agreements: [ACTIVE_AGREEMENT],
      attempts: [baseAttemptRow()],
    });

    const outcome = await executeRenewalAttempt(seedAttempt(), {
      adapterOverride: chargeAdapter({ outcome: 'failed', retryable: true, failureCode: 'INSUFFICIENT_FUNDS' }),
    });

    expect(outcome).toBe('retry_scheduled');
    const { db } = stateful.current;
    const attempt = db.attempts[0];
    expect(attempt.status).toBe('retryable_failed');
    expect(attempt.failureCode).toBe('INSUFFICIENT_FUNDS');
    expect(attempt.nextRetryAt?.toISOString()).toBe('2026-09-02T00:00:00.000Z'); // D1

    const subscription = db.subscriptions[0];
    expect(subscription.status).toBe('past_due');
    expect(subscription.gracePeriodEnd?.toISOString()).toBe('2026-09-08T00:00:00.000Z'); // +7d from period start
    // Entitlement retained: period end untouched.
    expect(subscription.currentPeriodEnd.toISOString()).toBe(PERIOD_START.toISOString());
  });

  it('stops all future charges immediately on a non-retryable failure (spec §12.4)', async () => {
    stateful.current = createDb({
      subscriptions: [seedSubscription()],
      attempts: [
        { id: 'attempt-1', subscriptionId: 'sub-1', periodStart: PERIOD_START, attemptNumber: 1, status: 'processing' },
        { id: 'attempt-2', subscriptionId: 'sub-1', periodStart: PERIOD_START, attemptNumber: 2, status: 'scheduled' },
      ],
      agreements: [ACTIVE_AGREEMENT],
    });

    const outcome = await executeRenewalAttempt(seedAttempt(), {
      adapterOverride: chargeAdapter({ outcome: 'failed', retryable: false, failureCode: 'AGREEMENT_REVOKED' }),
    });

    expect(outcome).toBe('failed_non_retryable');
    const { db } = stateful.current;
    expect(db.attempts[0].status).toBe('failed');
    expect(db.attempts[1].status).toBe('canceled');
    expect(db.subscriptions[0].autoRenew).toBe(false);
    expect(db.agreements[0].status).toBe('revoked');
  });

  it('fails the attempt when the channel cannot charge agreements (v1 recurring off)', async () => {
    stateful.current = createDb({
      subscriptions: [seedSubscription()],
      agreements: [ACTIVE_AGREEMENT],
      attempts: [baseAttemptRow()],
    });
    const outcome = await executeRenewalAttempt(seedAttempt(), { adapterOverride: {} as never });
    expect(outcome).toBe('failed_non_retryable');
    expect(stateful.current.db.attempts[0].failureCode).toBe('AGREEMENT_CHARGE_NOT_SUPPORTED');
  });

  it('skips when the subscription has no billing plan reference', async () => {
    stateful.current = createDb({
      subscriptions: [seedSubscription({ billingPlanId: null })],
      agreements: [ACTIVE_AGREEMENT],
      attempts: [baseAttemptRow()],
    });
    const attempt = seedAttempt({ subscription: { billingPlanId: null } });
    const outcome = await executeRenewalAttempt(attempt, { adapterOverride: chargeAdapter({ outcome: 'succeeded' }) });
    expect(outcome).toBe('failed_non_retryable');
  });
});

describe('reconcileRenewalPayment idempotency', () => {
  it('returns renewal_already_processed for an already-succeeded attempt', async () => {
    stateful.current = createDb({
      attempts: [
        {
          id: 'attempt-1',
          subscriptionId: 'sub-1',
          paymentOrderId: 'order-1',
          periodStart: PERIOD_START,
          periodEnd: PERIOD_END,
          attemptNumber: 1,
          status: 'succeeded',
        },
      ],
      subscriptions: [seedSubscription()],
      orders: [
        {
          id: 'order-1',
          orderType: 'renewal',
          status: 'paid',
          amountCents: 319920,
          provider: 'wechatpay',
        },
      ],
    });

    const outcome = await reconcileRenewalPayment(stateful.current, {
      paymentOrderId: 'order-1',
      provider: 'wechatpay',
      providerTransactionId: 'wx-txn-1',
      amountCents: 319920,
      paidAt: NOW_PAST_DUE,
      paymentEventId: 'evt-1',
    });
    expect(outcome).toBe('renewal_already_processed');
  });
});

describe('expireGracePeriods (spec §12.4 final row)', () => {
  it('expires past_due subscriptions once the grace window lapses', async () => {
    vi.useRealTimers();
    stateful.current = createDb({
      subscriptions: [
        seedSubscription({ status: 'past_due', gracePeriodEnd: new Date('2026-09-07T00:00:00.000Z') }),
        seedSubscription({ id: 'sub-2', status: 'past_due', gracePeriodEnd: new Date('2026-09-30T00:00:00.000Z') }),
      ],
      attempts: [
        { id: 'attempt-1', subscriptionId: 'sub-1', status: 'retryable_failed' },
      ],
    });

    const count = await expireGracePeriods(new Date('2026-09-08T00:01:00.000Z'));
    expect(count).toBe(1);
    const { db } = stateful.current;
    expect(db.subscriptions[0].status).toBe('expired');
    expect(db.subscriptions[0].autoRenew).toBe(false);
    expect(db.subscriptions[1].status).toBe('past_due'); // still inside grace
    expect(db.attempts[0].status).toBe('canceled');
  });
});
