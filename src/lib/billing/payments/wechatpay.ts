// WeChat Pay adapter — wraps existing v3 Native pay gateway code (spec §9).
// Recurring (委托代扣) is NOT implemented until merchant approval lands:
// capability stays hardcoded OFF and agreement methods throw NOT_CONFIGURED
// (remediation §4.2 — env flags alone must never expose an unimplemented
// capability).

import {
  buildWechatAuthorizationHeader,
  createWechatNativeCheckout,
  decryptWechatResource,
  isPaymentProviderConfigured,
  verifyWechatNotificationSignature,
} from '@/lib/billing/gateways';
import { billingMetric } from '@/lib/billing/log';
import type {
  ChargeAgreementInput,
  ChargeAgreementResult,
  ClosePaymentInput,
  ClosePaymentResult,
  CreateAgreementInput,
  CreateAgreementResult,
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProviderAdapter,
  ProviderCapabilities,
  QueryAgreementInput,
  QueryAgreementResult,
  QueryPaymentInput,
  QueryPaymentResult,
  RawWebhookInput,
  RevokeAgreementInput,
  VerifiedProviderEvent,
  WebhookParseError,
} from '@/lib/billing/payments/provider';

function envString(key: string): string | null {
  const value = process.env[key]?.trim();
  return value ? value : null;
}

function notConfigured(method: string): never {
  throw new Error(`WECHATPAY_RECURRING_NOT_CONFIGURED: ${method} requires merchant approval and WECHATPAY_CONTRACT_TEMPLATE_ID (spec §22)`);
}

export const wechatPayAdapter: PaymentProviderAdapter = {
  provider: 'wechatpay',

  getCapabilities(): ProviderCapabilities {
    // Recurring is hardcoded OFF until the full 委托代扣 implementation ships
    // AND merchant approval lands (remediation §4.2): env flags are advisory
    // config for that future work and must not flip capability by themselves.
    return {
      oneTimePayment: isPaymentProviderConfigured('wechatpay'),
      recurringPayment: false,
      payAndSign: false,
    };
  },

  async createOneTimePayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const result = await createWechatNativeCheckout({
      order: {
        id: input.orderId,
        amountCents: input.amountCents,
        currency: input.currency,
      } as unknown as Parameters<typeof createWechatNativeCheckout>[0]['order'],
      plan: {
        name: input.description,
        key: '',
        provider: 'wechatpay',
      } as unknown as Parameters<typeof createWechatNativeCheckout>[0]['plan'],
      requestOrigin: input.requestOrigin,
      expiresAt: input.expiresAt,
    });

    const payload = result.providerPayload as { codeUrl?: string } | undefined;
    return {
      presentation: 'qr_code',
      codeUrl: payload?.codeUrl,
      providerSessionId: result.providerSessionId,
      providerPayload: result.providerPayload,
    };
  },

  async closePayment(input: ClosePaymentInput): Promise<ClosePaymentResult> {
    // POST + JSON body {mchid} per WeChat Pay v3 (remediation §4.1 — the old
    // DELETE + query-string form was a protocol error and never worked).
    const mchid = envString('WECHATPAY_MCH_ID') ?? '';
    const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(input.orderId)}/close`;
    const body = JSON.stringify({ mchid });
    let response: Response;
    try {
      response = await fetch(`https://api.mch.weixin.qq.com${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: buildWechatAuthorizationHeader({ method: 'POST', path, body }),
        },
        body,
      });
    } catch (error) {
      // Network failure is retryable — throw so the caller schedules a retry.
      throw new Error(`WeChat Pay close network error: ${(error as Error).message}`);
    }
    if (response.status === 204 || response.ok) {
      return { outcome: 'closed' };
    }
    const errorBody = (await response.json().catch(() => ({}))) as { code?: string };
    const code = errorBody.code ?? '';
    if (code === 'ORDER_PAID' || code === 'ORDER_CLOSED' || code === 'TRADE_ERROR') {
      // Already in a final money state — caller must query + reconcile.
      return { outcome: 'already_paid' };
    }
    if (code === 'ORDER_NOT_EXIST' || response.status === 404) {
      return { outcome: 'gone' };
    }
    // Signature/system errors: retryable.
    throw new Error(`WeChat Pay close failed: ${response.status} ${code}`);
  },

  async queryPayment(input: QueryPaymentInput): Promise<QueryPaymentResult> {
    try {
      const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(input.orderId)}?mchid=${encodeURIComponent(envString('WECHATPAY_MCH_ID') ?? '')}`;
      const response = await fetch(`https://api.mch.weixin.qq.com${path}`, {
        headers: {
          Accept: 'application/json',
          Authorization: buildWechatAuthorizationHeader({ method: 'GET', path, body: '' }),
        },
      });
      if (!response.ok) {
        return { status: null, providerTransactionId: null, paidAt: null, amountCents: null, currency: null };
      }
      const data = (await response.json()) as {
        trade_state?: string;
        transaction_id?: string;
        success_time?: string;
        amount?: { total?: number; currency?: string };
      };
      return {
        status: data.trade_state ?? null,
        providerTransactionId: data.transaction_id ?? null,
        paidAt: data.success_time ? new Date(data.success_time) : null,
        amountCents:
          data.amount?.currency && data.amount.currency !== 'CNY'
            ? null
            : typeof data.amount?.total === 'number'
              ? data.amount.total
              : null,
        currency: data.amount?.currency ?? null,
      };
    } catch {
      return { status: null, providerTransactionId: null, paidAt: null, amountCents: null, currency: null };
    }
  },

  async verifyWebhook(input: RawWebhookInput): Promise<VerifiedProviderEvent | WebhookParseError> {
    const timestamp = input.headers['wechatpay-timestamp'] ?? null;
    const nonce = input.headers['wechatpay-nonce'] ?? null;
    const signature = input.headers['wechatpay-signature'] ?? null;
    if (!timestamp || !nonce || !signature) {
      return { error: 'MALFORMED_PAYLOAD', message: 'Missing WeChat Pay signature headers' };
    }

    let verified: boolean;
    try {
      verified = verifyWechatNotificationSignature({ body: input.rawBody, timestamp, nonce, signature });
    } catch (error) {
      return { error: 'MALFORMED_PAYLOAD', message: `Signature verification failed: ${(error as Error).message}` };
    }
    if (!verified) {
      billingMetric('billing_webhook_invalid_total', { provider: 'wechatpay' });
      return { error: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' };
    }

    let event: {
      id?: string;
      event_type?: string;
      resource?: { ciphertext: string; nonce: string; associated_data?: string };
    };
    try {
      event = JSON.parse(input.rawBody);
      if (!event.id || !event.resource) {
        return { error: 'MALFORMED_PAYLOAD', message: 'Missing event id or resource' };
      }
    } catch {
      return { error: 'MALFORMED_PAYLOAD', message: 'Body is not valid JSON' };
    }

    let resource: Record<string, unknown>;
    try {
      resource = decryptWechatResource(event.resource);
    } catch (error) {
      return { error: 'MALFORMED_PAYLOAD', message: `Resource decryption failed: ${(error as Error).message}` };
    }

    const amount = resource.amount as { total?: number; payer_total?: number; currency?: string } | undefined;
    return {
      providerEventId: event.id,
      eventType: event.event_type ?? 'unknown',
      providerOrderId: typeof resource.out_trade_no === 'string' ? resource.out_trade_no : null,
      providerTransactionId: typeof resource.transaction_id === 'string' ? resource.transaction_id : null,
      amountCents: typeof amount?.total === 'number' ? amount.total : null,
      currency: typeof amount?.currency === 'string' ? amount.currency : null,
      status: typeof resource.trade_state === 'string' ? resource.trade_state : null,
      paidAt: typeof resource.success_time === 'string' ? new Date(resource.success_time) : null,
      appId: typeof resource.appid === 'string' ? resource.appid : null,
      mchId: typeof resource.mchid === 'string' ? resource.mchid : null,
      raw: resource,
    };
  },

  // ─── Recurring (委托代扣) — stubs until merchant approval (spec §22) ──────

  async createAgreement(_input: CreateAgreementInput): Promise<CreateAgreementResult> {
    notConfigured('createAgreement');
  },

  async queryAgreement(_input: QueryAgreementInput): Promise<QueryAgreementResult> {
    notConfigured('queryAgreement');
  },

  async revokeAgreement(_input: RevokeAgreementInput): Promise<void> {
    notConfigured('revokeAgreement');
  },

  async chargeAgreement(_input: ChargeAgreementInput): Promise<ChargeAgreementResult> {
    notConfigured('chargeAgreement');
  },
};
