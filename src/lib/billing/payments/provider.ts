// Payment provider abstraction (spec §9). Auto-renewal methods are optional
// and only present after capability detection — configuring one-time payment
// credentials must NOT make recurring look available.

import type { BillingProvider } from '@/types/billing';

export type ProviderCapabilities = {
  oneTimePayment: boolean;
  recurringPayment: boolean;
  payAndSign: boolean;
};

export type CreatePaymentInput = {
  /** Local PaymentOrder id — used as the provider out_trade_no. */
  orderId: string;
  amountCents: number;
  currency: string;
  description: string;
  idempotencyKey: string;
  requestOrigin?: string;
  /** Channel-side expiry for the order. Adapters translate it into
   * time_expire (wechat, RFC 3339) / timeout_express (alipay, minutes)
   * so a stale QR or redirect link can no longer be paid
   * (remediation §4.1). */
  expiresAt?: Date;
};

export type CreatePaymentResult = {
  presentation: 'qr_code' | 'redirect';
  codeUrl?: string;
  redirectUrl?: string;
  providerSessionId: string;
  providerPayload?: Record<string, unknown>;
  expiresAt?: Date;
};

export type ClosePaymentInput = {
  orderId: string;
  providerSessionId?: string | null;
};

/** Channel-agnostic close outcome (remediation §4.1): 'already_paid' tells the
 * caller to reconcile (query + capture) instead of silently discarding. */
export type ClosePaymentResult =
  | { outcome: 'closed' }
  | { outcome: 'already_paid' }
  | { outcome: 'gone' };

export type QueryPaymentInput = {
  orderId: string;
  providerSessionId?: string | null;
};

export type QueryPaymentResult = {
  status: string | null;
  providerTransactionId: string | null;
  paidAt: Date | null;
  /** Channel-confirmed amount in cents, when the query response carries it —
   * used by watchdog/close-check reconciliation (remediation §4.1/§4.4). */
  amountCents: number | null;
  /** Currency reported by the provider query. Successful active-query
   * reconciliation must fail closed when it is absent or mismatched. */
  currency: string | null;
};

export type RawWebhookInput = {
  rawBody: string;
  headers: Record<string, string | null>;
  form?: Record<string, string>;
};

export type VerifiedProviderEvent = {
  providerEventId: string;
  eventType: string;
  providerOrderId: string | null;
  providerTransactionId: string | null;
  amountCents: number | null;
  /** Channel currency code (e.g. CNY). Adapters fill it whenever the payload
   * carries one; the webhook layer REQUIRES it on success events (remediation §4.9). */
  currency: string | null;
  status: string | null;
  paidAt: Date | null;
  appId: string | null;
  mchId: string | null;
  raw: Record<string, unknown>;
};

export type WebhookParseError = {
  error: 'INVALID_SIGNATURE' | 'MALFORMED_PAYLOAD';
  message: string;
};

export type CreateAgreementInput = {
  checkoutSessionId: string;
  userId: string;
  templateId?: string;
  notifyUrl?: string;
  requestOrigin?: string;
};

export type CreateAgreementResult = {
  providerAgreementId: string;
  redirectUrl?: string;
  qrCodeUrl?: string;
};

export type QueryAgreementInput = {
  providerAgreementId: string;
};

export type QueryAgreementResult = {
  status: 'pending' | 'active' | 'revoked' | 'expired' | 'failed';
  providerUserId?: string | null;
  signedAt?: Date | null;
  expiresAt?: Date | null;
};

export type RevokeAgreementInput = {
  providerAgreementId: string;
};

export type ChargeAgreementInput = {
  providerAgreementId: string;
  orderId: string;
  amountCents: number;
  currency: string;
  description: string;
  idempotencyKey: string;
};

export type ChargeAgreementResult = {
  outcome: 'succeeded' | 'pending';
  providerTransactionId?: string;
  failureCode?: string;
  failureMessage?: string;
  retryable?: boolean;
};

export interface PaymentProviderAdapter {
  provider: BillingProvider;
  getCapabilities(): ProviderCapabilities;

  createOneTimePayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  closePayment(input: ClosePaymentInput): Promise<ClosePaymentResult>;
  queryPayment(input: QueryPaymentInput): Promise<QueryPaymentResult>;
  verifyWebhook(input: RawWebhookInput): Promise<VerifiedProviderEvent | WebhookParseError>;

  createAgreement?(input: CreateAgreementInput): Promise<CreateAgreementResult>;
  queryAgreement?(input: QueryAgreementInput): Promise<QueryAgreementResult>;
  revokeAgreement?(input: RevokeAgreementInput): Promise<void>;
  chargeAgreement?(input: ChargeAgreementInput): Promise<ChargeAgreementResult>;
}

import { wechatPayAdapter } from '@/lib/billing/payments/wechatpay';
import { alipayAdapter } from '@/lib/billing/payments/alipay';

const ADAPTERS: Record<string, PaymentProviderAdapter> = {
  wechatpay: wechatPayAdapter,
  alipay: alipayAdapter,
};

export function getAdapter(provider: string): PaymentProviderAdapter {
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    throw new Error(`Unknown payment provider: ${provider}`);
  }
  return adapter;
}

export function listProviderAvailability(): Record<
  string,
  { oneTime: boolean; autoRenew: boolean }
> {
  const availability: Record<string, { oneTime: boolean; autoRenew: boolean }> = {};
  for (const [name, adapter] of Object.entries(ADAPTERS)) {
    const capabilities = adapter.getCapabilities();
    availability[name] = {
      oneTime: capabilities.oneTimePayment,
      autoRenew: capabilities.recurringPayment,
    };
  }
  return availability;
}
