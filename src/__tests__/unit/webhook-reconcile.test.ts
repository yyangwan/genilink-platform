import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Stateful in-memory prisma fake (per-file) ──────────────────────────────

type Row = Record<string, any>;

const stateful = vi.hoisted(() => ({ current: null as any }));

vi.mock('@/lib/db', () => {
  const MODELS = [
    'user', 'workspace', 'workspaceMember', 'project', 'wechatLoginSession',
    'subscription', 'billingPlan', 'paymentOrder', 'paymentEvent',
    'checkoutSession', 'promotion', 'coupon', 'couponRedemption',
    'paymentAgreement', 'renewalAttempt', 'billingNotification',
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

import { reconcileCheckoutPayment } from '@/lib/billing/reconcile';
import { alipayAdapter } from '@/lib/billing/payments/alipay';
import { wechatPayAdapter } from '@/lib/billing/payments/wechatpay';

vi.mock('@/lib/billing/gateways', () => ({
  isPaymentProviderConfigured: vi.fn(() => false),
  isSuccessfulProviderStatus: vi.fn((_provider: string, status: string | null) => status === 'SUCCESS' || status === 'TRADE_SUCCESS' || status === 'TRADE_FINISHED'),
  verifyAlipayNotificationSignature: vi.fn(() => true),
  verifyWechatNotificationSignature: vi.fn(() => true),
  decryptWechatResource: vi.fn(() => ({
    out_trade_no: 'order-1',
    transaction_id: 'wx-txn-1',
    trade_state: 'SUCCESS',
    amount: { total: 319920, currency: 'CNY' },
    success_time: '2026-08-22T10:05:00.000Z',
    appid: 'wx-app',
    mchid: 'mch-1',
  })),
}));

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (condition instanceof Date) {
      return row[key] instanceof Date && row[key].getTime() === condition.getTime();
    }
    if (condition && typeof condition === 'object' && !Array.isArray(condition) && (condition as Row).constructor === Object) {
      const filter = condition as Row;
      if ('in' in filter) return (filter.in as unknown[]).includes(row[key]);
      if ('lt' in filter) return row[key] < filter.lt;
      if ('gt' in filter) return row[key] > filter.gt;
      return false;
    }
    if (key.includes('_')) {
      // Composite unique keys like userId_workspaceId_module — already applied
      // via explicit findUnique handling; skip here.
      return true;
    }
    return row[key] === condition;
  });
}

function createDb(seed: { orders?: Row[]; sessions?: Row[]; subscriptions?: Row[]; redemptions?: Row[]; events?: Row[] }) {
  const db = {
    orders: seed.orders ?? [],
    sessions: seed.sessions ?? [],
    subscriptions: seed.subscriptions ?? [],
    redemptions: seed.redemptions ?? [],
    events: seed.events ?? [],
    attempts: [] as Row[],
    notifications: [] as Row[],
  };

  const updateRow = (list: Row[], where: Row, data: Row): Row | null => {
    const index = list.findIndex((row) => matches(row, where));
    if (index === -1) return null;
    list[index] = { ...list[index], ...data };
    return list[index];
  };

  return {
    db,
    paymentOrder: {
      findUnique: async ({ where }: any) => {
        const order = db.orders.find((row) => matches(row, where));
        if (!order) return null;
        const attempt = order.orderType === 'renewal' || db.attempts.some((a) => a.paymentOrderId === order.id)
          ? db.attempts.find((a) => a.paymentOrderId === order.id) ?? null
          : null;
        return {
          ...order,
          checkoutSession: order.checkoutSessionId ? db.sessions.find((s) => s.id === order.checkoutSessionId) : null,
          renewalAttempt: attempt
            ? {
                ...attempt,
                subscription: db.subscriptions.find((s) => s.id === attempt.subscriptionId) ?? null,
              }
            : null,
        };
      },
      update: async ({ where, data }: any) => {
        const row = updateRow(db.orders, where, data);
        if (!row) throw new Error('order not found for update');
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        db.orders.forEach((row, index) => {
          if (matches(row, where)) {
            db.orders[index] = { ...row, ...data };
            count += 1;
          }
        });
        return { count };
      },
      create: async ({ data }: any) => {
        const row = { id: `order-${db.orders.length + 1}`, ...data };
        db.orders.push(row);
        return row;
      },
      count: async () => 0,
    },
    checkoutSession: {
      findUnique: async ({ where }: any) => db.sessions.find((row) => matches(row, where)) ?? null,
      update: async ({ where, data }: any) => {
        const row = updateRow(db.sessions, where, data);
        if (!row) throw new Error('session not found');
        return row;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        db.sessions.forEach((row, index) => {
          if (matches(row, where)) {
            db.sessions[index] = { ...row, ...data };
            count += 1;
          }
        });
        return { count };
      },
    },
    couponRedemption: {
      findUnique: async ({ where }: any) => db.redemptions.find((row) => matches(row, where)) ?? null,
      update: async ({ where, data }: any) => updateRow(db.redemptions, where, data),
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        db.redemptions.forEach((row, index) => {
          if (matches(row, where)) {
            db.redemptions[index] = { ...row, ...data };
            count += 1;
          }
        });
        return { count };
      },
      count: async () => 0,
      create: async ({ data }: any) => {
        const row = { id: `redemption-${db.redemptions.length + 1}`, ...data };
        db.redemptions.push(row);
        return row;
      },
    },
    subscription: {
      findUnique: async ({ where }: any) => {
        if (where.userId_workspaceId_module) {
          const { userId, workspaceId, module } = where.userId_workspaceId_module;
          return db.subscriptions.find((s) => s.userId === userId && s.workspaceId === workspaceId && s.module === module) ?? null;
        }
        return db.subscriptions.find((row) => matches(row, where)) ?? null;
      },
      upsert: async ({ where, create, update }: any) => {
        const existing = db.subscriptions.find(
          (s) =>
            s.userId === where.userId_workspaceId_module.userId &&
            s.workspaceId === where.userId_workspaceId_module.workspaceId &&
            s.module === where.userId_workspaceId_module.module,
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: 'sub-new', ...create };
        db.subscriptions.push(row);
        return row;
      },
      update: async ({ where, data }: any) => updateRow(db.subscriptions, where, data),
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        db.subscriptions.forEach((row, index) => {
          if (matches(row, where)) {
            db.subscriptions[index] = { ...row, ...data };
            count += 1;
          }
        });
        return { count };
      },
    },
    paymentEvent: {
      findUnique: async ({ where }: any) => db.events.find((row) => matches(row, where)) ?? null,
      create: async ({ data }: any) => {
        const row = { id: `event-row-${db.events.length + 1}`, ...data };
        db.events.push(row);
        return row;
      },
      upsert: async ({ where, create, update }: any) => {
        const existing = db.events.find((row) => matches(row, where));
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `event-row-${db.events.length + 1}`, processedAt: null, ...create };
        db.events.push(row);
        return row;
      },
      update: async ({ where, data }: any) => updateRow(db.events, where, data),
    },
    renewalAttempt: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }: any) => {
        const row = { id: `attempt-${db.attempts.length + 1}`, ...data };
        db.attempts.push(row);
        return row;
      },
      update: async ({ where, data }: any) => updateRow(db.attempts, where, data),
      updateMany: async () => ({ count: 0 }),
    },
    billingNotification: {
      upsert: async ({ where, create }: any) => {
        const key = where.subscriptionId_type_periodEnd;
        const existing = db.notifications.find((row) =>
          row.subscriptionId === key.subscriptionId &&
          row.type === key.type &&
          row.periodEnd.getTime() === key.periodEnd.getTime(),
        );
        if (existing) return existing;
        const row = { id: `notification-${db.notifications.length + 1}`, ...create };
        db.notifications.push(row);
        return row;
      },
      updateMany: async () => ({ count: 0 }),
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(stateful.current),
    $queryRaw: async () => [],
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PLAN = { id: 'plan-1', key: 'suite-pro-yearly', billingCycle: 'yearly', module: 'suite', priceCents: 399900 };

function seedSession(overrides: Row = {}) {
  return {
    id: 'session-1',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    billingPlanId: 'plan-1',
    purchaseType: 'new',
    status: 'processing',
    currency: 'CNY',
    subtotalCents: 399900,
    discountCents: 79980,
    amountDueCents: 319920,
    renewalAmountCents: 399900,
    planSnapshot: { key: 'suite-pro-yearly', tier: 'pro', billingCycle: 'yearly' },
    discountSnapshot: { duration: 'once', durationCycles: null, discountCents: 79980 },
    couponId: 'coupon-1',
    autoRenew: false,
    paymentAgreement: null,
    redemption: REDEMPTION,
    billingPlan: PLAN,
    ...overrides,
  };
}

const REDEMPTION = { id: 'red-1', checkoutSessionId: 'session-1', status: 'reserved', discountCents: 79980 };

function seedOrder(overrides: Row = {}) {
  return {
    id: 'order-1',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    billingPlanId: 'plan-1',
    module: 'suite',
    billingCycle: 'yearly',
    provider: 'wechatpay',
    status: 'opened',
    amountCents: 319920,
    currency: 'CNY',
    checkoutSessionId: 'session-1',
    orderType: 'initial',
    attemptNumber: 1,
    ...overrides,
  };
}

const paidAt = new Date('2026-08-22T10:05:00.000Z');

function callReconcile(overrides: Partial<Parameters<typeof reconcileCheckoutPayment>[0]> = {}) {
  return reconcileCheckoutPayment({
    paymentEventId: 'event-1',
    paymentOrderId: 'order-1',
    provider: 'wechatpay',
    providerTransactionId: 'wx-txn-1',
    amountCents: 319920,
    paidAt,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reconcileCheckoutPayment (spec §11.2, single transaction)', () => {
  it('activates the subscription, completes the session and redeems the coupon', async () => {
    stateful.current = createDb({
      orders: [seedOrder()],
      sessions: [seedSession()],
      redemptions: [{ ...REDEMPTION }],
      events: [{ providerEventId: 'event-1', status: 'received' }],
    });

    const outcome = await callReconcile();
    expect(outcome).toBe('activated');

    const { db } = stateful.current;
    expect(db.orders[0].status).toBe('paid');
    expect(db.orders[0].providerTransactionId).toBe('wx-txn-1');
    expect(db.sessions[0].status).toBe('completed');
    expect(db.redemptions.length).toBe(1);
    expect(db.redemptions[0].status).toBe('redeemed');
    expect(db.subscriptions).toHaveLength(1);
    expect(db.subscriptions[0].status).toBe('active');
    expect(db.subscriptions[0].currentPeriodStart.toISOString()).toBe(paidAt.toISOString());
    expect(db.subscriptions[0].currentPeriodEnd.toISOString()).toBe('2027-08-22T10:05:00.000Z');
    expect(db.subscriptions[0].renewalPriceCents).toBe(399900);
    expect(db.subscriptions[0].autoRenew).toBe(false);
    expect(db.events[0].status).toBe('processed');
    expect(db.events[0].paymentOrderId).toBe('order-1');
  });

  it('is idempotent: a repeated webhook for a paid order does not re-activate (spec §11.1)', async () => {
    stateful.current = createDb({
      orders: [seedOrder({ status: 'paid', paidAt })],
      sessions: [seedSession({ status: 'completed', completedAt: paidAt })],
      events: [{ providerEventId: 'event-1', status: 'processed', processedAt: paidAt }],
    });

    const outcome = await callReconcile();
    expect(outcome).toBe('already_paid');
    expect(stateful.current.db.subscriptions).toHaveLength(0);
  });

  it('refuses activation when the paid amount does not match the quote (spec §11.2 step 5)', async () => {
    stateful.current = createDb({
      orders: [seedOrder()],
      sessions: [seedSession()],
      redemptions: [{ ...REDEMPTION }],
      events: [{ providerEventId: 'event-1', status: 'received' }],
    });

    const outcome = await callReconcile({ amountCents: 1 });
    expect(outcome).toBe('amount_mismatch');
    const { db } = stateful.current;
    expect(db.orders[0].status).toBe('opened'); // not paid
    expect(db.subscriptions).toHaveLength(0);
    expect(db.sessions[0].status).toBe('processing'); // not completed
  });

  it('detects a second successful attempt as an anomaly and never double-activates', async () => {
    // Attempt 1 already paid and completed the session; attempt 2 also reports
    // paid — a different order, so the idempotent skip must NOT apply.
    stateful.current = createDb({
      orders: [
        seedOrder({ status: 'paid', paidAt, attemptNumber: 1 }),
        seedOrder({ id: 'order-2', status: 'opened', attemptNumber: 2 }),
      ],
      sessions: [seedSession({ status: 'completed', completedAt: paidAt })],
      events: [{ providerEventId: 'event-2', status: 'received' }],
    });

    const outcome = await callReconcile({ paymentEventId: 'event-2', paymentOrderId: 'order-2' });
    expect(outcome).toBe('duplicate_success_anomaly');
    const { db } = stateful.current;
    expect(db.orders[1].status).toBe('paid'); // channel fact is retained for refund/review
    expect(db.subscriptions).toHaveLength(0);
    expect(db.events[0].status).toBe('requires_review');
  });

  it('extends from the existing period end for manual renewals — never shortens (spec §11.2)', async () => {
    const existingEnd = new Date('2026-12-31T00:00:00.000Z');
    stateful.current = createDb({
      orders: [seedOrder({ amountCents: 399900 })],
      sessions: [seedSession({
        purchaseType: 'manual_renewal',
        subtotalCents: 399900,
        discountCents: 0,
        amountDueCents: 399900,
        couponId: null,
        redemption: null,
        discountSnapshot: null,
      })],
      subscriptions: [{
        id: 'sub-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        module: 'suite',
        status: 'active',
        billingCycle: 'yearly',
        currentPeriodStart: new Date('2025-12-31T00:00:00.000Z'),
        currentPeriodEnd: existingEnd,
      }],
      events: [{ providerEventId: 'event-1', status: 'received' }],
    });

    const outcome = await callReconcile({ amountCents: 399900 });
    expect(outcome).toBe('activated');
    const subscription = stateful.current.db.subscriptions[0];
    expect(subscription.currentPeriodEnd.toISOString()).toBe('2027-12-31T00:00:00.000Z');
  });

  it('links an active agreement and enables autoRenew (spec §11.2 step 10)', async () => {
    stateful.current = createDb({
      orders: [seedOrder()],
      sessions: [seedSession({
        autoRenew: true,
        paymentAgreement: { id: 'agr-1', status: 'active', provider: 'wechatpay' },
      })],
      events: [{ providerEventId: 'event-1', status: 'received' }],
    });

    const outcome = await callReconcile();
    expect(outcome).toBe('activated');
    const subscription = stateful.current.db.subscriptions[0];
    expect(subscription.autoRenew).toBe(true);
    expect(subscription.paymentAgreementId).toBe('agr-1');
    expect(subscription.nextBillingAt?.toISOString()).toBe(subscription.currentPeriodEnd.toISOString());
  });

  it('writes repeating discount snapshots with durationCycles - 1 remaining (spec §7.6)', async () => {
    stateful.current = createDb({
      orders: [seedOrder()],
      sessions: [seedSession({
        discountSnapshot: { duration: 'repeating', durationCycles: 3, discountCents: 79980 },
      })],
      redemptions: [{ ...REDEMPTION }],
      events: [{ providerEventId: 'event-1', status: 'received' }],
    });

    await callReconcile();
    const subscription = stateful.current.db.subscriptions[0];
    expect(subscription.discountRemainingCycles).toBe(2);
    expect(subscription.discountSnapshot.duration).toBe('repeating');
  });

  it('parks a late paid notification on an expired session for review instead of failing (remediation §4.1)', async () => {
    stateful.current = createDb({
      orders: [seedOrder()],
      sessions: [seedSession({ status: 'expired' })],
      redemptions: [{ ...REDEMPTION }],
      events: [{ providerEventId: 'event-1', status: 'received' }],
    });

    // The expired -> completed transition used to throw and 500-looped the
    // webhook; now the captured payment lands in the manual review queue.
    const outcome = await callReconcile();
    expect(outcome).toBe('late_success_requires_review');
    const { db } = stateful.current;
    expect(db.orders[0].status).toBe('paid');
    expect(db.sessions[0].status).toBe('requires_review');
    expect(db.subscriptions).toHaveLength(0); // never auto-activated
    expect(db.events[0].status).toBe('requires_review');
  });

  it('reconciles a late paid webhook even after the close-sweep marked the order expired (second-review finding 1)', async () => {
    stateful.current = createDb({
      // The sweep already closed the channel order and marked it expired
      // locally — the user paid at the same moment.
      orders: [seedOrder({ status: 'expired', closedAt: paidAt })],
      sessions: [seedSession({ status: 'expired' })],
      redemptions: [{ ...REDEMPTION }],
      events: [{ providerEventId: 'event-1', status: 'received' }],
    });

    const outcome = await callReconcile();
    expect(outcome).toBe('late_success_requires_review');
    const { db } = stateful.current;
    expect(db.orders[0].status).toBe('paid'); // channel fact recorded, no throw
    expect(db.sessions[0].status).toBe('requires_review');
    // Coupon stays reserved until the review outcome (no premature burn).
    expect(db.redemptions[0].status).toBe('reserved');
    expect(db.subscriptions).toHaveLength(0);
  });

  it('records a pending order paid after its checkout expired', async () => {
    stateful.current = createDb({
      orders: [seedOrder({ status: 'pending' })],
      sessions: [seedSession({ status: 'expired' })],
      events: [{ providerEventId: 'event-1', status: 'received' }],
    });

    const outcome = await callReconcile();
    expect(outcome).toBe('late_success_requires_review');
    expect(stateful.current.db.orders[0].status).toBe('paid');
    expect(stateful.current.db.sessions[0].status).toBe('requires_review');
  });

  it('parks a superseded canceled attempt that is paid while its replacement is open', async () => {
    stateful.current = createDb({
      orders: [seedOrder({ status: 'canceled', closedAt: paidAt })],
      sessions: [seedSession({ status: 'processing' })],
      redemptions: [{ ...REDEMPTION }],
      events: [{ providerEventId: 'event-1', status: 'received' }],
    });

    const outcome = await callReconcile();
    expect(outcome).toBe('late_success_requires_review');
    expect(stateful.current.db.orders[0].status).toBe('paid');
    expect(stateful.current.db.sessions[0].status).toBe('requires_review');
    expect(stateful.current.db.subscriptions).toHaveLength(0);
  });

  it('rejects a callback whose channel does not match the stored order', async () => {
    stateful.current = createDb({
      orders: [seedOrder({ provider: 'wechatpay' })],
      sessions: [seedSession()],
      events: [{ providerEventId: 'event-1', status: 'received' }],
    });

    const outcome = await callReconcile({ provider: 'alipay' });
    expect(outcome).toBe('provider_mismatch');
    expect(stateful.current.db.orders[0].status).toBe('opened');
    expect(stateful.current.db.sessions[0].status).toBe('processing');
    expect(stateful.current.db.events[0].status).toBe('rejected');
  });

  it('rejects a success event with a missing amount instead of trusting it (remediation §4.9)', async () => {
    stateful.current = createDb({
      orders: [seedOrder()],
      sessions: [seedSession()],
      redemptions: [{ ...REDEMPTION }],
      events: [{ providerEventId: 'event-1', status: 'received' }],
    });

    const outcome = await callReconcile({ amountCents: null });
    expect(outcome).toBe('amount_mismatch');
    const { db } = stateful.current;
    expect(db.orders[0].status).toBe('opened');
    expect(db.subscriptions).toHaveLength(0);
    expect(db.events[0].status).toBe('rejected');
  });
});

describe('provider webhook parsing (spec §11.1: verify then read)', () => {
  it('alipay parses yuan strings into integer cents', async () => {
    const parsed = await alipayAdapter.verifyWebhook({
      rawBody: '',
      headers: {},
      form: {
        notify_id: 'n-1',
        out_trade_no: 'order-1',
        trade_no: 'ali-txn-1',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '3199.20',
        app_id: 'app-1',
        notify_time: '2026-08-22 18:05:00',
      },
    });
    expect('error' in parsed).toBe(false);
    if (!('error' in parsed)) {
      expect(parsed.amountCents).toBe(319920);
      expect(parsed.providerOrderId).toBe('order-1');
      expect(parsed.providerTransactionId).toBe('ali-txn-1');
      expect(parsed.status).toBe('TRADE_SUCCESS');
    }
  });

  it('rejects alipay payloads with an invalid signature', async () => {
    const { verifyAlipayNotificationSignature } = await import('@/lib/billing/gateways');
    vi.mocked(verifyAlipayNotificationSignature).mockReturnValueOnce(false);
    const parsed = await alipayAdapter.verifyWebhook({
      rawBody: '',
      headers: {},
      form: { out_trade_no: 'order-1', total_amount: '1.00', sign: 'bad' },
    });
    expect(parsed).toMatchObject({ error: 'INVALID_SIGNATURE' });
  });

  it('wechatpay decrypts the resource into a verified event with cents amounts', async () => {
    const parsed = await wechatPayAdapter.verifyWebhook({
      rawBody: JSON.stringify({ id: 'evt-1', event_type: 'TRANSACTION.SUCCESS', resource: { ciphertext: 'x', nonce: 'y' } }),
      headers: {
        'wechatpay-timestamp': '1',
        'wechatpay-nonce': 'n',
        'wechatpay-signature': 's',
      },
    });
    expect('error' in parsed).toBe(false);
    if (!('error' in parsed)) {
      expect(parsed.providerEventId).toBe('evt-1');
      expect(parsed.amountCents).toBe(319920);
      expect(parsed.providerTransactionId).toBe('wx-txn-1');
      expect(parsed.mchId).toBe('mch-1');
    }
  });

  it('wechatpay rejects payloads missing signature headers', async () => {
    const parsed = await wechatPayAdapter.verifyWebhook({
      rawBody: '{}',
      headers: {},
    });
    expect(parsed).toMatchObject({ error: 'MALFORMED_PAYLOAD' });
  });
});

describe('webhook route dispatch (remediation §4.3/§4.9)', () => {
  async function postWechatWebhook(body: Row) {
    const { POST } = await import('@/app/api/billing/webhooks/[provider]/route');
    const req = new Request('http://localhost/api/billing/webhooks/wechatpay', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'wechatpay-timestamp': '1',
        'wechatpay-nonce': 'n',
        'wechatpay-signature': 's',
      },
    });
    return POST(req as never, { params: Promise.resolve({ provider: 'wechatpay' }) } as never);
  }

  const renewalDbSeed = () => createDb({
    orders: [seedOrder({
      id: 'order-1',
      checkoutSessionId: null,
      orderType: 'renewal',
      status: 'processing',
      amountCents: 319920,
    })],
    subscriptions: [{
      id: 'sub-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
      module: 'suite',
      status: 'active',
      billingCycle: 'yearly',
      provider: 'wechatpay',
      renewalPriceCents: 399900,
      discountSnapshot: null,
      discountRemainingCycles: 0,
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2027-08-01T00:00:00.000Z'),
    }],
    events: [],
  });

  function seedRenewalAttempt() {
    const db = stateful.current.db;
    const attempt = {
      id: 'attempt-1',
      subscriptionId: 'sub-1',
      paymentOrderId: 'order-1',
      periodStart: new Date('2027-08-01T00:00:00.000Z'),
      periodEnd: new Date('2028-08-01T00:00:00.000Z'),
      attemptNumber: 1,
      amountCents: 319920,
      status: 'processing',
    };
    db.attempts.push(attempt);
    return attempt;
  }

  it('routes a renewal order webhook into the unified reconciliation entry (not legacy activation)', async () => {
    vi.stubEnv('WECHATPAY_MCH_ID', 'mch-1');
    vi.stubEnv('WECHATPAY_APP_ID', 'wx-app');
    stateful.current = renewalDbSeed();
    seedRenewalAttempt();

    const response = await postWechatWebhook({
      id: 'evt-renewal-1',
      event_type: 'TRANSACTION.SUCCESS',
      resource: { ciphertext: 'x', nonce: 'y' },
    });

    expect(response.status).toBe(200);
    const { db } = stateful.current;
    // The renewal was reconciled: order paid, attempt succeeded, period extended.
    expect(db.orders[0].status).toBe('paid');
    expect(db.attempts[0].status).toBe('succeeded');
    expect(db.subscriptions[0].currentPeriodEnd.toISOString()).toBe('2028-08-01T00:00:00.000Z');
  });

  it('acks an already processed event without resetting or reconciling it again', async () => {
    vi.stubEnv('WECHATPAY_MCH_ID', 'mch-1');
    vi.stubEnv('WECHATPAY_APP_ID', 'wx-app');
    stateful.current = renewalDbSeed();
    stateful.current.db.events.push({
      providerEventId: 'evt-renewal-duplicate',
      status: 'processed',
      processedAt: paidAt,
    });

    const response = await postWechatWebhook({
      id: 'evt-renewal-duplicate',
      event_type: 'TRANSACTION.SUCCESS',
      resource: { ciphertext: 'x', nonce: 'y' },
    });

    expect(response.status).toBe(200);
    expect(stateful.current.db.events[0].status).toBe('processed');
    expect(stateful.current.db.orders[0].status).toBe('processing');
  });

  it('permanently rejects a success event whose merchant identity mismatches (remediation §4.9)', async () => {
    vi.stubEnv('WECHATPAY_MCH_ID', 'different-mch');
    vi.stubEnv('WECHATPAY_APP_ID', 'wx-app');
    stateful.current = renewalDbSeed();

    const response = await postWechatWebhook({
      id: 'evt-bad-identity',
      event_type: 'TRANSACTION.SUCCESS',
      resource: { ciphertext: 'x', nonce: 'y' },
    });

    // Ack so the channel stops retrying, but the event is stored as rejected.
    expect(response.status).toBe(200);
    const { db } = stateful.current;
    expect(db.orders[0].status).toBe('processing'); // untouched
    expect(db.events[0].status).toBe('rejected');
  });

  it('permanently rejects a success event without an amount (remediation §4.9)', async () => {
    vi.stubEnv('WECHATPAY_MCH_ID', 'mch-1');
    vi.stubEnv('WECHATPAY_APP_ID', 'wx-app');
    const { decryptWechatResource } = await import('@/lib/billing/gateways');
    vi.mocked(decryptWechatResource).mockReturnValueOnce({
      out_trade_no: 'order-1',
      transaction_id: 'wx-txn-1',
      trade_state: 'SUCCESS',
      // amount intentionally missing
      success_time: '2026-08-22T10:05:00.000Z',
      appid: 'wx-app',
      mchid: 'mch-1',
    } as never);
    stateful.current = renewalDbSeed();

    const response = await postWechatWebhook({
      id: 'evt-no-amount',
      event_type: 'TRANSACTION.SUCCESS',
      resource: { ciphertext: 'x', nonce: 'y' },
    });

    expect(response.status).toBe(200);
    const { db } = stateful.current;
    expect(db.orders[0].status).toBe('processing'); // never activated
    expect(db.events[0].status).toBe('rejected');
  });
});
