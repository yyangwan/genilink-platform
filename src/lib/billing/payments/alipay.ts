// Alipay adapter — wraps the existing page-pay URL builder (spec §9).
// Cycle-pay (周期扣款) agreement methods are stubs until merchant approval;
// recurring capability stays hardcoded OFF (remediation §4.2).

import {
  closeAlipayTrade,
  createAlipayCheckoutUrl,
  isPaymentProviderConfigured,
  queryAlipayTrade,
  verifyAlipayNotificationSignature,
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
  throw new Error(`ALIPAY_RECURRING_NOT_CONFIGURED: ${method} requires merchant approval and ALIPAY_AGREEMENT_PRODUCT_CODE (spec §22)`);
}

export const alipayAdapter: PaymentProviderAdapter = {
  provider: 'alipay',

  getCapabilities(): ProviderCapabilities {
    // Recurring is hardcoded OFF until the full 周期扣款 implementation ships
    // AND merchant approval lands (remediation §4.2).
    return {
      oneTimePayment: isPaymentProviderConfigured('alipay'),
      recurringPayment: false,
      payAndSign: false,
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
      expiresAt: input.expiresAt,
    });

    return {
      presentation: 'redirect',
      redirectUrl: result.checkoutUrl,
      providerSessionId: result.providerSessionId,
      providerPayload: result.providerPayload,
    };
  },

  async closePayment(input: ClosePaymentInput): Promise<ClosePaymentResult> {
    // alipay.trade.close (remediation §4.1) — previously a no-op, which let a
    // stale redirect link stay payable after the session expired.
    const outcome = await closeAlipayTrade(input.orderId);
    return { outcome };
  },

  async queryPayment(input: QueryPaymentInput): Promise<QueryPaymentResult> {
    // Active query (alipay.trade.query) for watchdog takeover & late checks.
    try {
      const result = await queryAlipayTrade(input.orderId);
      return {
        status: result.status,
        providerTransactionId: result.providerTransactionId,
        paidAt: result.paidAt,
        amountCents: result.amountCents,
      };
    } catch {
      return { status: null, providerTransactionId: null, paidAt: null, amountCents: null };
    }
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

    // notify_id is what makes Alipay event de-duplication reliable — a payload
    // without it cannot be safely stored (remediation §4.9).
    if (!form.notify_id) {
      return { error: 'MALFORMED_PAYLOAD', message: 'Missing alipay notify_id' };
    }

    const totalAmountYuan = typeof form.total_amount === 'string' ? Number.parseFloat(form.total_amount) : NaN;
    const amountCents = Number.isFinite(totalAmountYuan) ? Math.round(totalAmountYuan * 100) : null;

    return {
      providerEventId: form.notify_id,
      eventType: form.trade_status ?? 'unknown',
      providerOrderId: form.out_trade_no ?? null,
      providerTransactionId: form.trade_no ?? null,
      amountCents,
      // Alipay CNY notifications carry no currency field; RMB is implied.
      currency: 'CNY',
      status: form.trade_status ?? null,
      paidAt: form.notify_time ? new Date(form.notify_time.replace('+08:00', 'Z').replace(' ', 'T')) : new Date(),
      appId: form.auth_app_id ?? form.app_id ?? null,
      mchId: form.seller_id ?? null,
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
