import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/billing/webhooks/[provider]/route';
import {
  buildWechatAuthorizationHeader,
  createAlipayCheckoutUrl,
  verifyAlipayNotificationSignature,
} from '@/lib/billing/gateways';
import { activateSubscriptionFromPayment } from '@/lib/billing/reconcile';
import { prisma } from '@/lib/db';

vi.mock('@/lib/billing/reconcile', () => ({
  activateSubscriptionFromPayment: vi.fn(),
}));

function createRsaKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

function escapePem(pem: string) {
  return pem.replace(/\n/g, '\\n');
}

function sortParams(params: Record<string, string>) {
  return Object.entries(params)
    .filter(([, value]) => value !== '')
    .sort(([a], [b]) => a.localeCompare(b));
}

function signParams(params: Record<string, string>, privateKeyPem: string, excludedKeys: string[] = []) {
  const canonical = sortParams(params)
    .filter(([key]) => !excludedKeys.includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(canonical);
  signer.end();
  return signer.sign(privateKeyPem, 'base64');
}

describe('Alipay billing gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://genilink.cn');
    vi.stubEnv('ALIPAY_APP_ID', '2016000000000000');
    vi.stubEnv('ALIPAY_NOTIFY_URL', 'https://genilink.cn/api/billing/webhooks/alipay');
  });

  it('signs WeChat Pay requests with an escaped PEM private key', () => {
    const { publicKey, privateKey } = createRsaKeyPair();
    vi.stubEnv('WECHATPAY_MCH_ID', 'merchant-1');
    vi.stubEnv('WECHATPAY_MCH_SERIAL_NO', 'serial-1');
    vi.stubEnv('WECHATPAY_MCH_PRIVATE_KEY', escapePem(privateKey));

    const body = JSON.stringify({ out_trade_no: 'order-1' });
    const authorization = buildWechatAuthorizationHeader({
      method: 'POST',
      path: '/v3/pay/transactions/native',
      body,
    });
    const timestamp = authorization.match(/timestamp="([^"]+)"/)?.[1];
    const nonce = authorization.match(/nonce_str="([^"]+)"/)?.[1];
    const signature = authorization.match(/signature="([^"]+)"/)?.[1];

    expect(timestamp).toBeTruthy();
    expect(nonce).toBeTruthy();
    expect(signature).toBeTruthy();

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`POST\n/v3/pay/transactions/native\n${timestamp}\n${nonce}\n${body}\n`);
    verifier.end();
    expect(verifier.verify(publicKey, signature!, 'base64')).toBe(true);
  });

  it('accepts an escaped, generically labelled PKCS#1 private key for Alipay', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    const productionStyleKey = privateKey
      .replace('BEGIN RSA PRIVATE KEY', 'BEGIN PRIVATE KEY')
      .replace('END RSA PRIVATE KEY', 'END PRIVATE KEY');
    vi.stubEnv('ALIPAY_PRIVATE_KEY', escapePem(productionStyleKey));

    const result = createAlipayCheckoutUrl({
      order: {
        id: 'order-escaped-key',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        billingPlanId: 'plan-1',
        module: 'suite',
        billingCycle: 'monthly',
        provider: 'alipay',
        status: 'opened',
        amountCents: 100,
        currency: 'CNY',
      },
      plan: {
        id: 'plan-1',
        key: 'suite-pro-monthly',
        module: 'suite',
        billingCycle: 'monthly',
        name: 'Content Monthly',
        description: 'Content monthly plan',
        priceCents: 100,
        currency: 'CNY',
        provider: 'alipay',
        checkoutUrl: null,
        sortOrder: 1,
        isActive: true,
        providerPriceId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      requestOrigin: 'https://genilink.cn',
    });

    const url = new URL(result.checkoutUrl);
    const signature = url.searchParams.get('sign');
    const payload = Object.fromEntries(
      [...url.searchParams.entries()].filter(([key]) => key !== 'sign'),
    );
    const canonical = sortParams(payload)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(canonical);
    verifier.end();
    expect(verifier.verify(publicKey, signature!, 'base64')).toBe(true);
  });

  it('builds a signed checkout url for page pay', () => {
    const { publicKey, privateKey } = createRsaKeyPair();
    vi.stubEnv('ALIPAY_PRIVATE_KEY', privateKey);
    vi.stubEnv('ALIPAY_PUBLIC_KEY', publicKey);

    const result = createAlipayCheckoutUrl({
      order: {
        id: 'order-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        billingPlanId: 'plan-1',
        module: 'suite',
        billingCycle: 'monthly',
        provider: 'alipay',
        status: 'opened',
        amountCents: 100,
        currency: 'CNY',
      },
      plan: {
        id: 'plan-1',
        key: 'suite-pro-monthly',
        module: 'suite',
        billingCycle: 'monthly',
        name: 'Content Monthly',
        description: 'Content monthly plan',
        priceCents: 100,
        currency: 'CNY',
        provider: 'alipay',
        checkoutUrl: null,
        sortOrder: 1,
        isActive: true,
        providerPriceId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      requestOrigin: 'https://genilink.cn',
    });

    const url = new URL(result.checkoutUrl);
    expect(url.origin + url.pathname).toBe('https://openapi.alipay.com/gateway.do');
    expect(url.searchParams.get('app_id')).toBe('2016000000000000');
    expect(url.searchParams.get('method')).toBe('alipay.trade.page.pay');
    expect(url.searchParams.get('notify_url')).toBe('https://genilink.cn/api/billing/webhooks/alipay');
    expect(url.searchParams.get('return_url')).toContain('https://genilink.cn/settings/billing');
    expect(url.searchParams.get('biz_content')).toContain('"out_trade_no":"order-1"');

    const sign = url.searchParams.get('sign');
    const signType = url.searchParams.get('sign_type');
    expect(signType).toBe('RSA2');
    expect(sign).toBeTruthy();

    const payload: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (key !== 'sign') {
        payload[key] = value;
      }
    }
    const canonical = sortParams(payload)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(canonical);
    verifier.end();
    expect(verifier.verify(publicKey, sign!, 'base64')).toBe(true);
    expect(result.providerSessionId).toBe('order-1');
  });

  it('flags an unlinked paid order for review instead of silently activating it (remediation §4.3)', async () => {
    const { publicKey, privateKey } = createRsaKeyPair();
    vi.stubEnv('ALIPAY_PRIVATE_KEY', privateKey);
    vi.stubEnv('ALIPAY_PUBLIC_KEY', publicKey);

    const payload = {
      notify_id: 'notify-1',
      out_trade_no: 'order-1',
      trade_no: 'trade-1',
      trade_status: 'TRADE_SUCCESS',
      seller_id: 'seller-1',
      app_id: '2016000000000000',
      total_amount: '1.00',
      charset: 'utf-8',
      sign_type: 'RSA2',
    };
    const sign = signParams(payload, privateKey, ['sign_type']);

    const form = new FormData();
    for (const [key, value] of Object.entries({ ...payload, sign })) {
      form.append(key, value);
    }

    (prisma.paymentEvent.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'event-1',
      processedAt: null,
    });
    (prisma.paymentEvent.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.paymentEvent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.paymentEvent.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.paymentOrder.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'order-1',
      checkoutSessionId: null,
      orderType: 'initial',
      renewalAttempt: null,
    });

    const req = new Request('http://localhost/api/billing/webhooks/alipay', {
      method: 'POST',
      body: form,
    });

    const res = await POST(req as never, { params: Promise.resolve({ provider: 'alipay' }) } as never);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('success');
    // An order with no checkout-session or renewal link must NEVER reach the
    // legacy activation path — it is parked as requires_review instead.
    expect(activateSubscriptionFromPayment).not.toHaveBeenCalled();
    expect(prisma.paymentEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { providerEventId: 'notify-1' },
        data: expect.objectContaining({
          status: 'requires_review',
          paymentOrderId: 'order-1',
        }),
      }),
    );
  });

  it('reports configuration for notification signature verification', () => {
    const { publicKey, privateKey } = createRsaKeyPair();
    vi.stubEnv('ALIPAY_PUBLIC_KEY', escapePem(publicKey));

    const params = {
      out_trade_no: 'order-1',
      trade_no: 'trade-1',
      trade_status: 'TRADE_SUCCESS',
      sign_type: 'RSA2',
    };
    const sign = signParams(params, privateKey, ['sign_type']);
    const payload = { ...params, sign };

    expect(verifyAlipayNotificationSignature(payload)).toBe(true);
  });
});
