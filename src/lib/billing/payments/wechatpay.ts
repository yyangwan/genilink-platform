// WeChat Pay adapter — wraps existing v3 Native pay gateway code (spec §9).
// Recurring (委托代扣) is NOT implemented until merchant approval lands:
// capability is env-gated and agreement methods throw NOT_CONFIGURED (spec §22).

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

export function wechatRecurringConfigured(): boolean {
  return Boolean(
    envString('WECHATPAY_RECURRING_ENABLED') === 'true' &&
    isPaymentProviderConfigured('wechatpay') &&
    envString('WECHATPAY_CONTRACT_TEMPLATE_ID'),
  );
}

function notConfigured(method: string): never {
  throw new Error(`WECHATPAY_RECURRING_NOT_CONFIGURED: ${method} requires merchant approval and WECHATPAY_CONTRACT_TEMPLATE_ID (spec §22)`);
}

export const wechatPayAdapter: PaymentProviderAdapter = {
  provider: 'wechatpay',

  getCapabilities(): ProviderCapabilities {
    const oneTimePayment = isPaymentProviderConfigured('wechatpay');
    const recurringPayment = wechatRecurringConfigured();
    return {
      oneTimePayment,
      recurringPayment,
      payAndSign: recurringPayment,
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
    });

    const payload = result.providerPayload as { codeUrl?: string } | undefined;
    return {
      presentation: 'qr_code',
      codeUrl: payload?.codeUrl,
      providerSessionId: result.providerSessionId,
      providerPayload: result.providerPayload,
    };
  },

  async closePayment(input: ClosePaymentInput): Promise<void> {
    // Best-effort close of the Native order so the stale QR cannot be paid.
    try {
      const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(input.orderId)}?mchid=${encodeURIComponent(envString('WECHATPAY_MCH_ID') ?? '')}`;
      await fetch(`https://api.mch.weixin.qq.com${path}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: buildWechatAuthorizationHeader({ method: 'DELETE', path, body: '' }),
        },
      });
    } catch (error) {
      console.warn('WeChat Pay close failed (best-effort)', { orderId: input.orderId, error });
    }
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
        return { status: null, providerTransactionId: null, paidAt: null };
      }
      const data = (await response.json()) as {
        trade_state?: string;
        transaction_id?: string;
        success_time?: string;
      };
      return {
        status: data.trade_state ?? null,
        providerTransactionId: data.transaction_id ?? null,
        paidAt: data.success_time ? new Date(data.success_time) : null,
      };
    } catch {
      return { status: null, providerTransactionId: null, paidAt: null };
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

    const amount = resource.amount as { total?: number; payer_total?: number } | undefined;
    return {
      providerEventId: event.id,
      eventType: event.event_type ?? 'unknown',
      providerOrderId: typeof resource.out_trade_no === 'string' ? resource.out_trade_no : null,
      providerTransactionId: typeof resource.transaction_id === 'string' ? resource.transaction_id : null,
      amountCents: typeof amount?.total === 'number' ? amount.total : null,
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
