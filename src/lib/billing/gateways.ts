import crypto from 'crypto';
import type { BillingPlanRecord } from '@/lib/billing/catalog';
import type { PaymentOrder } from '@/types/billing';

export type PaymentProvider = 'wechatpay' | 'alipay';

export function getAppBaseUrl(requestOrigin?: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  if (requestOrigin) {
    return requestOrigin.replace(/\/$/, '');
  }

  return 'http://localhost:3001';
}

export function buildCheckoutUrls(baseUrl: string, orderId: string) {
  const success = new URL('/settings/billing', baseUrl);
  success.searchParams.set('checkout', 'success');
  success.searchParams.set('orderId', orderId);

  const cancel = new URL('/settings/billing', baseUrl);
  cancel.searchParams.set('checkout', 'canceled');
  cancel.searchParams.set('orderId', orderId);

  const payPage = new URL(`/settings/billing/pay/${orderId}`, baseUrl);

  return {
    successUrl: success.toString(),
    cancelUrl: cancel.toString(),
    payPageUrl: payPage.toString(),
  };
}

function envString(key: string): string | null {
  const value = process.env[key]?.trim();
  return value ? value : null;
}

export function isPaymentProviderConfigured(provider: PaymentProvider): boolean {
  if (provider === 'wechatpay') {
    return Boolean(
      envString('WECHATPAY_MCH_ID') &&
      envString('WECHATPAY_APP_ID') &&
      envString('WECHATPAY_API_V3_KEY') &&
      envString('WECHATPAY_MCH_PRIVATE_KEY') &&
      envString('WECHATPAY_MCH_SERIAL_NO') &&
      envString('WECHATPAY_NOTIFY_URL') &&
      envString('WECHATPAY_PLATFORM_CERT_PEM')
    );
  }

  return Boolean(
    envString('ALIPAY_APP_ID') &&
    envString('ALIPAY_PRIVATE_KEY') &&
    envString('ALIPAY_PUBLIC_KEY') &&
    envString('ALIPAY_NOTIFY_URL')
  );
}

export function getProviderDisplayName(provider: PaymentProvider): string {
  return provider === 'wechatpay' ? '微信支付' : '支付宝';
}

function normalizePemKey(pem: string): string {
  return pem.includes('BEGIN') ? pem : pem.replace(/\\n/g, '\n');
}

function signWithRsaSha256(message: string, privateKeyPem: string): string {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  signer.end();
  return signer.sign(normalizePemKey(privateKeyPem), 'base64');
}

function verifyWithRsaSha256(message: string, signature: string, publicKeyPem: string): boolean {
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(message);
  verifier.end();
  return verifier.verify(normalizePemKey(publicKeyPem), signature, 'base64');
}

export function buildWechatAuthorizationHeader(params: {
  method: string;
  path: string;
  body: string;
}) {
  const mchid = envString('WECHATPAY_MCH_ID');
  const serialNo = envString('WECHATPAY_MCH_SERIAL_NO');
  const privateKey = envString('WECHATPAY_MCH_PRIVATE_KEY');
  if (!mchid || !serialNo || !privateKey) {
    throw new Error('WeChat Pay merchant credentials are not configured');
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const message = `${params.method}\n${params.path}\n${timestamp}\n${nonceStr}\n${params.body}\n`;
  const signature = signWithRsaSha256(message, privateKey);

  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`;
}

export function verifyWechatNotificationSignature(params: {
  body: string;
  timestamp: string;
  nonce: string;
  signature: string;
}): boolean {
  const publicKey = envString('WECHATPAY_PLATFORM_CERT_PEM');
  if (!publicKey) {
    throw new Error('WeChat Pay platform certificate is not configured');
  }

  const message = `${params.timestamp}\n${params.nonce}\n${params.body}\n`;
  return verifyWithRsaSha256(message, params.signature, publicKey);
}

export function decryptWechatResource(resource: {
  ciphertext: string;
  nonce: string;
  associated_data?: string;
}): Record<string, unknown> {
  const apiV3Key = envString('WECHATPAY_API_V3_KEY');
  if (!apiV3Key) {
    throw new Error('WeChat Pay API v3 key is not configured');
  }

  const key = Buffer.from(apiV3Key, 'utf8');
  const raw = Buffer.from(resource.ciphertext, 'base64');
  if (raw.length < 17) {
    throw new Error('Invalid WeChat Pay ciphertext');
  }

  const tag = raw.subarray(raw.length - 16);
  const data = raw.subarray(0, raw.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(resource.nonce, 'utf8'));
  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
  }
  decipher.setAuthTag(tag);
  const decoded = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  return JSON.parse(decoded) as Record<string, unknown>;
}

export function buildWechatNativeOrderRequest(params: {
  order: PaymentOrder;
  plan: BillingPlanRecord;
  notifyUrl: string;
}) {
  const appid = envString('WECHATPAY_APP_ID');
  const mchid = envString('WECHATPAY_MCH_ID');
  if (!appid || !mchid) {
    throw new Error('WeChat Pay app credentials are not configured');
  }

  return {
    appid,
    mchid,
    description: params.plan.name,
    out_trade_no: params.order.id,
    notify_url: params.notifyUrl,
    amount: {
      total: params.order.amountCents,
      currency: params.order.currency,
    },
    attach: JSON.stringify({
      orderId: params.order.id,
      planKey: params.plan.key,
      provider: 'wechatpay',
    }),
  };
}

export async function createWechatNativeCheckout(params: {
  order: PaymentOrder;
  plan: BillingPlanRecord;
  requestOrigin?: string;
}) {
  const baseUrl = getAppBaseUrl(params.requestOrigin);
  const notifyUrl = envString('WECHATPAY_NOTIFY_URL') ?? new URL('/api/billing/webhooks/wechatpay', baseUrl).toString();
  const payload = buildWechatNativeOrderRequest({ order: params.order, plan: params.plan, notifyUrl });
  const body = JSON.stringify(payload);
  const response = await fetch('https://api.mch.weixin.qq.com/v3/pay/transactions/native', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: buildWechatAuthorizationHeader({
        method: 'POST',
        path: '/v3/pay/transactions/native',
        body,
      }),
    },
    body,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`WeChat Pay order creation failed: ${response.status} ${text}`);
  }

  const data = JSON.parse(text) as { code_url?: string };
  if (!data.code_url) {
    throw new Error('WeChat Pay response missing code_url');
  }

  return {
    providerSessionId: params.order.id,
    checkoutUrl: new URL(`/settings/billing/pay/${params.order.id}`, baseUrl).toString(),
    providerPayload: {
      codeUrl: data.code_url,
      request: payload,
    },
  };
}

function sortObjectEntries(value: Record<string, string | number | boolean | undefined | null>): [string, string][] {
  return Object.entries(value)
    .filter(([, raw]) => raw !== undefined && raw !== null && raw !== '')
    .map(([key, raw]) => [key, String(raw)])
    .sort(([a], [b]) => a.localeCompare(b));
}

function encodeAlipayValue(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function formatAlipayTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

export function createAlipayCheckoutUrl(params: {
  order: PaymentOrder;
  plan: BillingPlanRecord;
  requestOrigin?: string;
}) {
  const appId = envString('ALIPAY_APP_ID');
  const privateKey = envString('ALIPAY_PRIVATE_KEY');
  const gateway = envString('ALIPAY_GATEWAY_URL') ?? 'https://openapi.alipay.com/gateway.do';
  const notifyUrl = envString('ALIPAY_NOTIFY_URL') ?? new URL('/api/billing/webhooks/alipay', getAppBaseUrl(params.requestOrigin)).toString();
  const returnUrl = new URL('/settings/billing', getAppBaseUrl(params.requestOrigin));
  returnUrl.searchParams.set('checkout', 'success');
  returnUrl.searchParams.set('orderId', params.order.id);

  if (!appId || !privateKey) {
    throw new Error('Alipay credentials are not configured');
  }

  const bizContent = {
    out_trade_no: params.order.id,
    product_code: 'FAST_INSTANT_TRADE_PAY',
    total_amount: (params.order.amountCents / 100).toFixed(2),
    subject: params.plan.name,
  };

  const baseParams: Record<string, string> = {
    app_id: appId,
    method: 'alipay.trade.page.pay',
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: formatAlipayTimestamp(new Date()),
    version: '1.0',
    notify_url: notifyUrl,
    return_url: returnUrl.toString(),
    biz_content: JSON.stringify(bizContent),
  };

  const canonical = sortObjectEntries(baseParams)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const sign = signWithRsaSha256(canonical, privateKey);

  const query = sortObjectEntries({ ...baseParams, sign })
    .map(([key, value]) => `${key}=${encodeAlipayValue(value)}`)
    .join('&');

  return {
    providerSessionId: params.order.id,
    checkoutUrl: `${gateway}?${query}`,
    providerPayload: {
      request: baseParams,
    },
  };
}

export function verifyAlipayNotificationSignature(params: Record<string, string>): boolean {
  const publicKey = envString('ALIPAY_PUBLIC_KEY');
  if (!publicKey) {
    throw new Error('Alipay public key is not configured');
  }

  const { sign, sign_type, ...rest } = params;
  if (!sign) {
    return false;
  }

  const canonical = sortObjectEntries(rest)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return verifyWithRsaSha256(canonical, sign, publicKey);
}

export function extractPaymentReference(provider: PaymentProvider, payload: Record<string, unknown>) {
  if (provider === 'wechatpay') {
    return {
      orderId: typeof payload.out_trade_no === 'string' ? payload.out_trade_no : null,
      providerTransactionId: typeof payload.transaction_id === 'string' ? payload.transaction_id : null,
      status: typeof payload.trade_state === 'string' ? payload.trade_state : null,
      paidAt: typeof payload.success_time === 'string' ? new Date(payload.success_time) : new Date(),
    };
  }

  return {
    orderId: typeof payload.out_trade_no === 'string' ? payload.out_trade_no : null,
    providerTransactionId: typeof payload.trade_no === 'string' ? payload.trade_no : null,
    status: typeof payload.trade_status === 'string' ? payload.trade_status : null,
    paidAt: new Date(),
  };
}

export function isSuccessfulProviderStatus(provider: PaymentProvider, status: string | null | undefined): boolean {
  if (!status) {
    return false;
  }

  if (provider === 'wechatpay') {
    return status === 'SUCCESS';
  }

  return status === 'TRADE_SUCCESS' || status === 'TRADE_FINISHED';
}
