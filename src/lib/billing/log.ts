// Structured billing logs (spec §16). Metrics are emitted as logs — no metrics
// infra exists yet. Secret-ish keys are redacted before serializing (spec §15).

const REDACT_KEY_PATTERN = /key|secret|sign|nonce|token|password|cert/i;

const KNOWN_FIELDS = new Set([
  'checkoutSessionId',
  'paymentOrderId',
  'subscriptionId',
  'renewalAttemptId',
  'provider',
  'providerTransactionId',
  'eventType',
  'statusFrom',
  'statusTo',
  'errorCode',
  'couponId',
  'attemptNumber',
  'purchaseType',
  'amountCents',
  'workerId',
  'outcome',
  'metric',
  'count',
  'durationMs',
  'notificationId',
  'notificationType',
  'reason',
]);

function redactValue(key: string, value: unknown): unknown {
  if (REDACT_KEY_PATTERN.test(key)) return '[redacted]';
  return value;
}

export function billingLog(event: string, fields: Record<string, unknown> = {}): void {
  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    event,
  };
  for (const [key, value] of Object.entries(fields)) {
    payload[key] = redactValue(key, value);
  }
  const line = JSON.stringify(payload);
  if (event === 'metric' || event === 'refund_queue' || event === 'alert') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export type BillingMetricName =
  | 'billing_checkout_created_total'
  | 'billing_checkout_completed_total'
  | 'billing_checkout_expired_total'
  | 'billing_coupon_apply_total'
  | 'billing_coupon_rejected_total'
  | 'billing_payment_success_total'
  | 'billing_payment_failure_total'
  | 'billing_webhook_invalid_total'
  | 'billing_agreement_active_total'
  | 'billing_renewal_success_total'
  | 'billing_renewal_failure_total'
  | 'billing_renewal_recovered_total'
  | 'billing_sms_sent_total'
  | 'billing_channel_close_sweep';

export function billingMetric(name: BillingMetricName, fields: Record<string, unknown> = {}): void {
  billingLog('metric', { metric: name, ...fields });
}

export { KNOWN_FIELDS };
