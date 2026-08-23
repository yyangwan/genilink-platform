// Alipay adapter — wraps the existing page-pay URL builder (spec §9).
// Cycle-pay (周期扣款) agreement methods are stubs until merchant approval (spec §22).

import {
  createAlipayCheckoutUrl,
  isPaymentProviderConfigured,
  verifyAlipayNotificationSignature,
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

export function alipayRecurringConfigured(): boolean {
  return Boolean(
    envString('ALIPAY_RECURRING_ENABLED') === 'true' &&
    isPaymentProviderConfigured('alipay') &&
    envString('ALIPAY_AGREEMENT_PRODUCT_CODE'),
  );
}

function notConfigured(method: string): never {
  throw new Error(`ALIPAY_RECURRING_NOT_CONFIGURED: ${method} requires merchant approval and ALIPAY_AGREEMENT_PRODUCT_CODE (spec §22)`);
}

export const alipayAdapter: PaymentProviderAdapter = {
  provider: 'alipay',

  getCapabilities(): ProviderCapabilities {
    const oneTimePayment = isPaymentProviderConfigured('alipay');
    const recurringPayment = alipayRecurringConfigured();
    return {
      oneTimePayment,
      recurringPayment,
      payAndSign: recurringPayment,
    };
  },

  async createOneTimePayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const result = createAlipayCheckoutUrl({
      order: {
        id: input.orderId,
        amountCents: input.amountCents,
        currency: input.currency,
      } as unknown as Parameters<typeof createAlipayCheckoutUrl>[0]['order'],
      plan: {
        name: input.description,
        key: '',
        provider: 'alipay',
      } as unknown as Parameters<typeof createAlipayCheckoutUrl>[0]['plan'],
      requestOrigin: input.requestOrigin,
    });

    return {
      presentation: 'redirect',
      redirectUrl: result.checkoutUrl,
      providerSessionId: result.providerSessionId,
      providerPayload: result.providerPayload,
    };
  },

  async closePayment(_input: ClosePaymentInput): Promise<void> {
    // Alipay page-pay orders expire on their own; no synchronous close API is
    // wired in v1. Kept as a no-op so the orchestrator's flow stays uniform.
  },

  async queryPayment(_input: QueryPaymentInput): Promise<QueryPaymentResult> {
    // Server-side active query (alipay.trade.query) is not wired in v1; async
    // notify is the source of truth. Return unknown so callers fall back.
    return { status: null, providerTransactionId: null, paidAt: null };
  },

  async verifyWebhook(input: RawWebhookInput): Promise<VerifiedProviderEvent | WebhookParseError> {
    const form = input.form ?? {};
    if (Object.keys(form).length === 0) {
      return { error: 'MALFORMED_PAYLOAD', message: 'Missing alipay form payload' };
    }

    let verified: boolean;
    try {
      verified = verifyAlipayNotificationSignature(form);
    } catch (error) {
      return { error: 'MALFORMED_PAYLOAD', message: `Signature verification failed: ${(error as Error).message}` };
    }
    if (!verified) {
      billingMetric('billing_webhook_invalid_total', { provider: 'alipay' });
      return { error: 'INVALID_SIGNATURE', message: 'Invalid alipay signature' };
    }

    const totalAmountYuan = typeof form.total_amount === 'string' ? Number.parseFloat(form.total_amount) : NaN;
    const amountCents = Number.isFinite(totalAmountYuan) ? Math.round(totalAmountYuan * 100) : null;

    return {
      providerEventId: form.notify_id ?? form.trade_no ?? form.out_trade_no ?? `alipay-${Date.now()}`,
      eventType: form.trade_status ?? 'unknown',
      providerOrderId: form.out_trade_no ?? null,
      providerTransactionId: form.trade_no ?? null,
      amountCents,
      status: form.trade_status ?? null,
      paidAt: form.notify_time ? new Date(form.notify_time.replace('+08:00', 'Z').replace(' ', 'T')) : new Date(),
      appId: form.auth_app_id ?? form.app_id ?? null,
      mchId: null,
      raw: { ...form },
    };
  },

  // ─── Recurring (周期扣款) — stubs until merchant approval (spec §22) ──────

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
