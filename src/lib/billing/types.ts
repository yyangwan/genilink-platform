// Billing domain types for the independent checkout flow.
// Statuses stay String in Prisma; these unions + state-machines.ts constrain them (spec §6.1).

export type CheckoutSessionStatus =
  | 'ready'
  | 'processing'
  | 'completed'
  | 'expired'
  | 'canceled'
  | 'failed';

export type PurchaseType = 'new' | 'upgrade' | 'manual_renewal';

export type PaymentAgreementStatus =
  | 'pending'
  | 'active'
  | 'revoked'
  | 'expired'
  | 'failed';

export type RenewalAttemptStatus =
  | 'scheduled'
  | 'notifying'
  | 'processing'
  | 'succeeded'
  | 'retryable_failed'
  | 'failed'
  | 'canceled';

export type DiscountType = 'fixed_amount' | 'percentage';
export type DiscountDuration = 'once' | 'repeating';
export type RedemptionStatus = 'reserved' | 'redeemed' | 'released';

export type PaymentOrderType = 'initial' | 'renewal';

export type CouponErrorCode =
  | 'COUPON_NOT_FOUND'
  | 'COUPON_INACTIVE'
  | 'COUPON_NOT_STARTED'
  | 'COUPON_EXPIRED'
  | 'COUPON_NOT_ELIGIBLE'
  | 'COUPON_MINIMUM_NOT_MET'
  | 'COUPON_REDEMPTION_LIMIT_REACHED'
  | 'COUPON_ALREADY_USED';

export type BillingErrorCode =
  | CouponErrorCode
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'PLAN_NOT_FOUND'
  | 'PLAN_NOT_CONFIGURED'
  | 'PLAN_DOWNGRADE_NOT_SUPPORTED'
  | 'AUTO_RENEW_ALREADY_ENABLED'
  | 'AUTO_RENEW_NOT_SUPPORTED'
  | 'AGREEMENT_VERSION_REQUIRED'
  | 'CHECKOUT_SESSION_EXPIRED'
  | 'CHECKOUT_SESSION_NOT_MODIFIABLE'
  | 'CHECKOUT_SESSION_NOT_CONFIRMABLE'
  | 'PAYMENT_PROVIDER_NOT_CONFIGURED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'QUOTE_MISMATCH'
  | 'INVALID_REQUEST'
  | 'INTERNAL_ERROR';

export type PlanSnapshot = {
  key: string;
  name: string;
  tier: string | null;
  billingCycle: string;
  module: string;
  priceCents: number;
  currency: string;
};

export type DiscountSnapshot = {
  promotionId: string;
  promotionName: string;
  couponCode: string;
  discountType: DiscountType;
  discountValue: number;
  duration: DiscountDuration;
  durationCycles: number | null;
  maximumDiscountCents: number | null;
  discountCents: number;
};

export type CheckoutQuote = {
  currency: 'CNY';
  subtotalCents: number;
  discountCents: number;
  amountDueCents: number;
  renewalAmountCents: number;
  planSnapshot: PlanSnapshot;
  discountSnapshot: DiscountSnapshot | null;
};

export type BillingApiError = {
  code: BillingErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export class BillingError extends Error {
  readonly code: BillingErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(code: BillingErrorCode, message: string, status: number, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const ERROR_STATUS: Partial<Record<BillingErrorCode, number>> = {
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  PLAN_NOT_FOUND: 404,
  PLAN_NOT_CONFIGURED: 503,
  PLAN_DOWNGRADE_NOT_SUPPORTED: 422,
  AUTO_RENEW_ALREADY_ENABLED: 409,
  AUTO_RENEW_NOT_SUPPORTED: 400,
  AGREEMENT_VERSION_REQUIRED: 400,
  CHECKOUT_SESSION_EXPIRED: 409,
  CHECKOUT_SESSION_NOT_MODIFIABLE: 409,
  CHECKOUT_SESSION_NOT_CONFIRMABLE: 409,
  PAYMENT_PROVIDER_NOT_CONFIGURED: 503,
  IDEMPOTENCY_KEY_REUSED: 409,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  QUOTE_MISMATCH: 409,
  INVALID_REQUEST: 400,
  INTERNAL_ERROR: 500,
};

const ERROR_MESSAGE_ZH: Partial<Record<BillingErrorCode, string>> = {
  COUPON_NOT_FOUND: '优惠码不存在',
  COUPON_INACTIVE: '优惠码已停用',
  COUPON_NOT_STARTED: '优惠活动尚未开始',
  COUPON_EXPIRED: '优惠码已过期',
  COUPON_NOT_ELIGIBLE: '优惠码不适用于当前套餐',
  COUPON_MINIMUM_NOT_MET: '订单金额未达到优惠最低消费',
  COUPON_REDEMPTION_LIMIT_REACHED: '优惠码已被领完',
  COUPON_ALREADY_USED: '优惠码已使用过',
  PLAN_NOT_FOUND: '套餐不存在',
  PLAN_NOT_CONFIGURED: '套餐尚未配置价格',
  PLAN_DOWNGRADE_NOT_SUPPORTED: '暂不支持降级套餐',
  AUTO_RENEW_ALREADY_ENABLED: '已开启自动续期，请在订阅管理中操作',
  AUTO_RENEW_NOT_SUPPORTED: '当前支付渠道暂不支持自动续期',
  AGREEMENT_VERSION_REQUIRED: '开启自动续期需要先同意代扣协议',
  CHECKOUT_SESSION_EXPIRED: '结算会话已过期',
  CHECKOUT_SESSION_NOT_MODIFIABLE: '当前状态下不能修改优惠码',
  CHECKOUT_SESSION_NOT_CONFIRMABLE: '当前状态下不能发起支付',
  PAYMENT_PROVIDER_NOT_CONFIGURED: '支付渠道尚未配置',
  IDEMPOTENCY_KEY_REUSED: '幂等键与之前请求不一致',
  IDEMPOTENCY_KEY_REQUIRED: '缺少幂等键',
  QUOTE_MISMATCH: '报价已变化，请刷新后重试',
  INVALID_REQUEST: '请求参数不正确',
  INTERNAL_ERROR: '服务内部错误',
};

export function billingErrorCodeZh(code: BillingErrorCode): string {
  return ERROR_MESSAGE_ZH[code] ?? code;
}

export function statusForBillingError(code: BillingErrorCode): number {
  if (ERROR_STATUS[code]) return ERROR_STATUS[code]!;
  // Coupon errors default to 422 per spec §7.4/§8.3.
  if (code.startsWith('COUPON_')) return 422;
  return 400;
}

export function toBillingError(code: BillingErrorCode, details: Record<string, unknown> = {}): BillingError {
  return new BillingError(code, billingErrorCodeZh(code), statusForBillingError(code), details);
}

/** Serialize any thrown value into the unified error envelope (spec §8). */
export function errorResponseBody(code: BillingErrorCode, message?: string, details: Record<string, unknown> = {}) {
  return {
    error: {
      code,
      message: message ?? billingErrorCodeZh(code),
      details,
    },
  };
}
