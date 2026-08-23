# 独立收银台、优惠与自动续期技术规格

版本：v1.0  
状态：待实现  
适用代码库：`genilink-platform`  
目标读者：产品、前端、后端、测试、运维

## 1. 文档目标

本文档将独立收银台方案细化为可直接编码、拆任务和验收的技术规格。

本期目标：

- 套餐页不再直接选择微信或支付宝。
- 所有购买、升级和手动续费统一进入独立收银台。
- 收银台支持微信支付和支付宝支付，并允许失败后切换渠道。
- 支持优惠码、首期优惠和服务端价格快照。
- 数据结构完整支持自动续期、解约、续费扣款、失败重试和宽限期。
- 渠道代扣能力未审批时，产品自动降级为单次支付，不虚假展示自动续期。
- 支付回调、优惠核销、订阅激活和续费全部具备幂等保护。

## 2. 当前实现与问题

当前购买入口位于：

- `src/components/billing/account-subscription-plans.tsx`
- `src/app/api/billing/checkout/route.ts`

当前流程：

```text
套餐卡片选择支付渠道
  -> POST /api/billing/checkout
  -> 立即创建 PaymentOrder
  -> 立即调用微信或支付宝
  -> 展示二维码或跳转支付宝
```

当前实现存在以下结构性问题：

- `PaymentOrder` 同时承担购买意图、报价和渠道支付尝试，无法安全切换支付方式。
- 支付金额直接取 `BillingPlan.priceCents`，缺少独立报价和优惠快照。
- 二维码过期后重新支付容易形成多个互不关联的购买订单。
- `Subscription.providerSubscriptionId` 当前可能保存交易号，不是真实代扣协议号。
- 当前微信 Native 和支付宝网页支付均为单次支付，不能直接用于后续自动扣款。
- 缺少自动续期协议、续费任务、失败重试、宽限期和取消续期模型。
- 缺少优惠活动、优惠码、使用限制和核销记录。

## 3. 已冻结的产品决策

以下决策作为 v1 编码默认值，修改时需要同步更新本文档：

| 决策项 | v1 规则 |
|---|---|
| 收银台路由 | `/checkout/[sessionId]` |
| 登录要求 | 必须登录，且只能访问当前用户和当前工作空间的结算会话 |
| 结算会话有效期 | 30 分钟 |
| 支付方式 | 微信支付、支付宝支付 |
| 支付尝试关系 | 一个结算会话可有多个支付尝试，但最多一个成功 |
| 优惠叠加 | v1 不支持叠加，一个结算会话最多一个优惠 |
| 优惠作用范围 | 默认仅首期，可配置作用 N 期 |
| 自动续期默认值 | 默认关闭，必须由用户主动开启 |
| 渠道能力降级 | 代扣能力不可用时只允许单次支付 |
| 升级生效时间 | 支付成功后立即生效并重新开始订阅周期 |
| 升级折算 | v1 不做旧套餐剩余价值折算 |
| 降级 | v1 不在收银台支持降级 |
| 扣款提醒 | 到期前 7 天、3 天 |
| 自动扣款重试 | 到期日、失败后第 1 天、失败后第 3 天 |
| 宽限期 | 7 天 |
| 关闭自动续期 | 当前周期继续有效，到期后不再扣款 |
| 续费价格 | 按签约时展示的续费规则计算；首期优惠结束后恢复标准价 |
| 币种 | v1 仅支持 CNY |

## 4. 领域边界

### 4.1 CheckoutSession

结算会话代表一次明确的购买意图和服务端报价。

它负责：

- 购买人、工作空间、套餐和购买类型。
- 套餐价格和优惠快照。
- 本次应付金额和下次续费金额。
- 自动续期选择及协议确认记录。
- 聚合多个支付尝试。
- 控制结算会话过期和最终完成。

### 4.2 PaymentOrder

沿用现有 `PaymentOrder` 表，但语义收窄为一次渠道支付尝试。

它负责：

- 微信或支付宝的一次下单请求。
- 渠道订单号、渠道交易号、二维码或跳转地址。
- 单次支付尝试状态。
- 支付成功、失败、关闭和退款信息。

### 4.3 Promotion / Coupon / CouponRedemption

分别负责优惠规则、可输入优惠码和实际核销记录。

### 4.4 PaymentAgreement

代表用户与支付渠道之间的自动扣款授权，不得与单次支付交易号混用。

### 4.5 RenewalAttempt

代表某个订阅周期的一次续费执行计划，负责扣款、重试和失败原因。

### 4.6 Subscription

继续作为权益有效期的唯一事实来源，扩展自动续期、下次计费和宽限期字段。

## 5. 总体架构

```text
套餐页
  -> CheckoutSession API
  -> Pricing Service
  -> Promotion Service
  -> 独立收银台
  -> Payment Orchestrator
     -> WeChatPay Adapter
     -> Alipay Adapter
  -> PaymentOrder
  -> Provider Webhook
  -> Billing Reconciliation Service
  -> Subscription

Renewal Scheduler
  -> Renewal Service
  -> Payment Agreement Adapter
  -> RenewalAttempt / PaymentOrder
  -> Provider Webhook
  -> Subscription period extension
```

建议新增目录：

```text
src/app/checkout/[sessionId]/page.tsx
src/app/api/billing/checkout-sessions/route.ts
src/app/api/billing/checkout-sessions/[sessionId]/route.ts
src/app/api/billing/checkout-sessions/[sessionId]/coupon/route.ts
src/app/api/billing/checkout-sessions/[sessionId]/confirm/route.ts
src/app/api/billing/subscriptions/[subscriptionId]/auto-renew/route.ts
src/app/api/internal/billing/renewals/run/route.ts

src/components/billing/checkout/checkout-page.tsx
src/components/billing/checkout/order-summary.tsx
src/components/billing/checkout/coupon-form.tsx
src/components/billing/checkout/payment-methods.tsx
src/components/billing/checkout/auto-renew-option.tsx
src/components/billing/checkout/payment-stage.tsx

src/lib/billing/checkout/service.ts
src/lib/billing/checkout/quote.ts
src/lib/billing/promotions/service.ts
src/lib/billing/payments/orchestrator.ts
src/lib/billing/payments/provider.ts
src/lib/billing/payments/wechatpay.ts
src/lib/billing/payments/alipay.ts
src/lib/billing/renewals/service.ts
src/lib/billing/reconcile.ts
```

## 6. 数据模型

### 6.1 枚举约束

当前 Prisma schema 使用 `String` 保存状态。v1 继续使用 `String`，TypeScript 中使用联合类型和状态转换函数约束，避免一次迁移引入大量 PostgreSQL enum。

新增类型：

```ts
type CheckoutSessionStatus =
  | 'ready'
  | 'processing'
  | 'completed'
  | 'expired'
  | 'canceled'
  | 'failed';

type PurchaseType = 'new' | 'upgrade' | 'manual_renewal';

type PaymentAgreementStatus =
  | 'pending'
  | 'active'
  | 'revoked'
  | 'expired'
  | 'failed';

type RenewalAttemptStatus =
  | 'scheduled'
  | 'notifying'
  | 'processing'
  | 'succeeded'
  | 'retryable_failed'
  | 'failed'
  | 'canceled';

type DiscountType = 'fixed_amount' | 'percentage';
type DiscountDuration = 'once' | 'repeating';
type RedemptionStatus = 'reserved' | 'redeemed' | 'released';
```

### 6.2 Prisma 模型草案

实现时按以下结构修改 `prisma/schema.prisma`。字段名称视为已冻结，除非数据库迁移验证发现冲突。

```prisma
model CheckoutSession {
  id                       String    @id @default(cuid()) @db.Text
  idempotencyKey           String    @unique @db.Text
  idempotencyRequestHash   String    @db.Text
  userId                   String    @db.Text
  user                     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  workspaceId              String    @db.Text
  workspace                Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  billingPlanId            String    @db.Text
  billingPlan              BillingPlan @relation(fields: [billingPlanId], references: [id])
  sourceSubscriptionId     String?   @db.Text
  sourceSubscription       Subscription? @relation("CheckoutSourceSubscription", fields: [sourceSubscriptionId], references: [id], onDelete: SetNull)
  purchaseType             String    @db.Text
  status                   String    @default("ready") @db.Text
  currency                 String    @default("CNY") @db.Text
  subtotalCents            Int
  discountCents            Int       @default(0)
  amountDueCents           Int
  renewalAmountCents       Int
  planSnapshot             Json
  discountSnapshot         Json?
  couponId                 String?   @db.Text
  coupon                   Coupon?   @relation(fields: [couponId], references: [id], onDelete: SetNull)
  autoRenew                Boolean   @default(false)
  agreementAcceptedVersion String?   @db.Text
  agreementAcceptedAt      DateTime?
  agreementAcceptedIp      String?   @db.Text
  agreementAcceptedUa      String?   @db.Text
  expiresAt                DateTime
  completedAt              DateTime?
  createdAt                DateTime  @default(now())
  updatedAt                DateTime  @updatedAt

  paymentOrders PaymentOrder[]
  redemption    CouponRedemption?
  paymentAgreement PaymentAgreement?

  @@index([userId, workspaceId, status])
  @@index([workspaceId, createdAt])
  @@index([expiresAt, status])
}

model Promotion {
  id                    String   @id @default(cuid()) @db.Text
  name                  String   @db.Text
  description           String?  @db.Text
  discountType          String   @db.Text
  discountValue         Int
  duration              String   @default("once") @db.Text
  durationCycles        Int?
  minimumAmountCents    Int?
  maximumDiscountCents  Int?
  eligiblePlanKeys      Json?
  eligibleBillingCycles Json?
  newCustomersOnly      Boolean  @default(false)
  maxRedemptions        Int?
  maxPerUser            Int      @default(1)
  maxPerWorkspace       Int      @default(1)
  startsAt              DateTime
  endsAt                DateTime?
  isActive              Boolean  @default(true)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  coupons Coupon[]
}

model Coupon {
  id          String    @id @default(cuid()) @db.Text
  promotionId String    @db.Text
  promotion   Promotion @relation(fields: [promotionId], references: [id], onDelete: Cascade)
  code        String    @unique @db.Text
  isActive    Boolean   @default(true)
  startsAt    DateTime?
  endsAt      DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  checkoutSessions CheckoutSession[]
  redemptions      CouponRedemption[]
}

model CouponRedemption {
  id                String    @id @default(cuid()) @db.Text
  couponId          String    @db.Text
  coupon            Coupon    @relation(fields: [couponId], references: [id], onDelete: Restrict)
  checkoutSessionId String    @unique @db.Text
  checkoutSession   CheckoutSession @relation(fields: [checkoutSessionId], references: [id], onDelete: Restrict)
  userId            String    @db.Text
  user              User      @relation(fields: [userId], references: [id], onDelete: Restrict)
  workspaceId       String    @db.Text
  workspace          Workspace @relation(fields: [workspaceId], references: [id], onDelete: Restrict)
  status            String    @default("reserved") @db.Text
  discountCents     Int
  reservedAt        DateTime  @default(now())
  redeemedAt        DateTime?
  releasedAt        DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  @@index([couponId, status])
  @@index([userId, couponId, status])
  @@index([workspaceId, couponId, status])
}

model PaymentAgreement {
  id                         String    @id @default(cuid()) @db.Text
  userId                     String    @db.Text
  user                       User      @relation(fields: [userId], references: [id], onDelete: Restrict)
  workspaceId                String    @db.Text
  workspace                  Workspace @relation(fields: [workspaceId], references: [id], onDelete: Restrict)
  checkoutSessionId          String?   @unique @db.Text
  checkoutSession            CheckoutSession? @relation(fields: [checkoutSessionId], references: [id], onDelete: SetNull)
  provider                   String    @db.Text
  status                     String    @default("pending") @db.Text
  providerAgreementId        String?   @unique @db.Text
  providerUserId             String?   @db.Text
  providerTemplateId         String?   @db.Text
  agreementVersion           String    @db.Text
  signedAt                   DateTime?
  revokedAt                  DateTime?
  expiresAt                  DateTime?
  providerPayload            Json?
  createdAt                  DateTime  @default(now())
  updatedAt                  DateTime  @updatedAt

  subscriptions Subscription[]

  @@index([userId, workspaceId, provider, status])
}

model RenewalAttempt {
  id                 String    @id @default(cuid()) @db.Text
  subscriptionId     String    @db.Text
  subscription       Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  paymentOrderId     String?   @unique @db.Text
  paymentOrder       PaymentOrder? @relation(fields: [paymentOrderId], references: [id], onDelete: SetNull)
  periodStart        DateTime
  periodEnd          DateTime
  scheduledAt        DateTime
  attemptNumber      Int       @default(1)
  amountCents        Int
  currency           String    @default("CNY") @db.Text
  status             String    @default("scheduled") @db.Text
  failureCode        String?   @db.Text
  failureMessage     String?   @db.Text
  nextRetryAt        DateTime?
  lockedBy           String?   @db.Text
  lockedUntil        DateTime?
  startedAt          DateTime?
  completedAt        DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  @@unique([subscriptionId, periodStart, attemptNumber])
  @@index([status, scheduledAt])
  @@index([status, nextRetryAt])
}
```

### 6.3 现有模型扩展

`PaymentOrder` 增加：

```prisma
checkoutSessionId      String?   @db.Text
checkoutSession        CheckoutSession? @relation(fields: [checkoutSessionId], references: [id], onDelete: SetNull)
orderType              String    @default("initial") @db.Text // initial | renewal
attemptNumber          Int       @default(1)
idempotencyKey         String?   @unique @db.Text
idempotencyRequestHash String?   @db.Text
providerTransactionId  String?   @unique @db.Text
failureCode            String?   @db.Text
failureMessage         String?   @db.Text
closedAt               DateTime?
renewalAttempt          RenewalAttempt?

@@unique([checkoutSessionId, attemptNumber])
@@index([checkoutSessionId, status])
```

`Subscription` 增加：

```prisma
autoRenew             Boolean   @default(false)
cancelAtPeriodEnd     Boolean   @default(false)
paymentAgreementId    String?   @db.Text
paymentAgreement      PaymentAgreement? @relation(fields: [paymentAgreementId], references: [id], onDelete: SetNull)
nextBillingAt         DateTime?
gracePeriodEnd        DateTime?
renewalPriceCents     Int?
priceSnapshot         Json?
discountSnapshot      Json?
discountRemainingCycles Int @default(0)
checkoutSessions      CheckoutSession[] @relation("CheckoutSourceSubscription")
renewalAttempts       RenewalAttempt[]
```

现有 `PaymentOrder.providerSubscriptionId` 和 `Subscription.providerSubscriptionId` 停止写入单次支付交易号。新实现中的单次渠道流水统一写入 `providerTransactionId`，真实自动扣款协议统一写入 `PaymentAgreement.providerAgreementId`。旧字段暂时保留为空以降低一次性重构范围，后续确认无调用后删除。

`User` 增加：

```prisma
checkoutSessions  CheckoutSession[]
paymentAgreements PaymentAgreement[]
couponRedemptions CouponRedemption[]
```

`Workspace` 增加：

```prisma
checkoutSessions  CheckoutSession[]
paymentAgreements PaymentAgreement[]
couponRedemptions CouponRedemption[]
```

`BillingPlan` 增加：

```prisma
checkoutSessions CheckoutSession[]
```

### 6.4 数据一致性约束

- `amountDueCents = subtotalCents - discountCents`，且不得小于 1 分。
- `discountCents` 不得大于 `subtotalCents - 1`。
- 一个 `CheckoutSession` 最多只有一个 `PaymentOrder.status = paid`。
- 一个订阅周期最多只有一个成功的 `RenewalAttempt`。
- `Subscription.autoRenew = true` 时必须存在 `PaymentAgreement.status = active`。
- `Subscription.cancelAtPeriodEnd = true` 时不得创建新的续费尝试。
- 所有时间以 UTC 入库，界面按 `Asia/Shanghai` 展示。

部分约束无法用 Prisma schema 表达，必须在事务和测试中保证。

## 7. 价格与优惠计算

### 7.1 唯一价格入口

新增纯函数：

```ts
calculateCheckoutQuote(input: {
  plan: BillingPlan;
  promotion?: Promotion | null;
  purchaseType: PurchaseType;
  now: Date;
}): CheckoutQuote
```

返回：

```ts
type CheckoutQuote = {
  currency: 'CNY';
  subtotalCents: number;
  discountCents: number;
  amountDueCents: number;
  renewalAmountCents: number;
  planSnapshot: PlanSnapshot;
  discountSnapshot: DiscountSnapshot | null;
};
```

任何 API、页面和支付渠道都不得自行计算最终金额。

### 7.2 百分比规则

`discountValue` 使用基点表示：

```text
10000 = 100%
2000  = 减免 20%，即 8 折
```

计算规则：

```ts
discountCents = Math.floor(subtotalCents * discountValue / 10000)
```

如配置 `maximumDiscountCents`，取两者最小值。

### 7.3 固定金额规则

`discountValue` 直接表示分：

```text
5000 = 减 50 元
```

### 7.4 优惠适用性校验顺序

1. 优惠活动和优惠码均启用。
2. 当前时间处于活动有效期。
3. 套餐 key 符合 `eligiblePlanKeys`。
4. 月付/年付符合 `eligibleBillingCycles`。
5. 原价满足最低消费金额。
6. 满足新用户限制。
7. 未超过总核销上限。
8. 未超过用户和工作空间使用上限。

统一错误码：

```text
COUPON_NOT_FOUND
COUPON_INACTIVE
COUPON_NOT_STARTED
COUPON_EXPIRED
COUPON_NOT_ELIGIBLE
COUPON_MINIMUM_NOT_MET
COUPON_REDEMPTION_LIMIT_REACHED
COUPON_ALREADY_USED
```

### 7.5 核销并发策略

应用优惠码时只计算报价，不占用额度。

确认支付时，在 PostgreSQL 事务中：

1. `SELECT ... FOR UPDATE` 锁定 `Coupon` 和 `Promotion`。
2. 重新执行全部适用性校验。
3. 统计 `reserved` 和 `redeemed` 记录。
4. 创建 `CouponRedemption.status = reserved`。
5. 更新结算会话价格快照。

支付成功后改为 `redeemed`。结算会话过期、取消或最终失败后改为 `released`。

### 7.6 多周期优惠

当 `Promotion.duration = repeating` 时，首笔支付成功后将优惠快照写入订阅：

```text
discountSnapshot = 支付时的不可变优惠规则
discountRemainingCycles = durationCycles - 1
```

每次续费报价只读取订阅快照，不读取后来被修改的活动配置。续费成功后将 `discountRemainingCycles` 减 1；扣款失败不消耗优惠周期。剩余周期为 0 后，续费金额恢复 `renewalPriceCents`。

### 7.7 购买类型判定

购买类型只能由服务端根据当前有效订阅和目标套餐计算：

| 当前状态 | 目标套餐 | 结果 |
|---|---|---|
| 无有效订阅 | 任意有效套餐 | `new` |
| 有效订阅 | 更高等级套餐 | `upgrade`，支付后立即生效 |
| 同一等级月付 | 同等级年付 | `upgrade`，支付后立即切换年付 |
| 有效订阅 | 完全相同套餐 | `manual_renewal` |
| 同一等级年付 | 同等级月付 | 拒绝，`PLAN_DOWNGRADE_NOT_SUPPORTED` |
| 有效订阅 | 更低等级套餐 | 拒绝，`PLAN_DOWNGRADE_NOT_SUPPORTED` |

手动续费只对 `autoRenew = false` 的订阅开放。支付成功后从当前 `currentPeriodEnd` 延长一个相同周期，不缩短现有有效期。自动续期已开启时返回 `AUTO_RENEW_ALREADY_ENABLED`，引导用户在订阅管理中操作。

## 8. API 契约

所有金额均使用整数分，所有接口均需要登录。写接口支持 `Idempotency-Key` 请求头。

同一个用户使用相同幂等键和相同请求体时返回首次结果；幂等键相同但请求体不同时返回 `409 IDEMPOTENCY_KEY_REUSED`。

请求体先做稳定 JSON 序列化，再计算 SHA-256 写入 `idempotencyRequestHash`。重放请求必须同时比较幂等键和请求摘要。

统一错误格式：

```json
{
  "error": {
    "code": "CHECKOUT_SESSION_EXPIRED",
    "message": "结算会话已过期",
    "details": {}
  }
}
```

### 8.1 创建结算会话

```http
POST /api/billing/checkout-sessions
Idempotency-Key: <uuid>
Content-Type: application/json
```

请求：

```json
{
  "planKey": "suite-pro-yearly",
  "couponCode": "WELCOME20"
}
```

服务端根据当前订阅自动判断 `purchaseType`，客户端不得指定价格和购买类型。

响应 `201`：

```json
{
  "checkoutSession": {
    "id": "cm...",
    "status": "ready",
    "purchaseType": "upgrade",
    "expiresAt": "2026-08-22T10:30:00.000Z",
    "plan": {
      "key": "suite-pro-yearly",
      "name": "专业版年付",
      "tier": "pro",
      "billingCycle": "yearly"
    },
    "quote": {
      "currency": "CNY",
      "subtotalCents": 399900,
      "discountCents": 40000,
      "amountDueCents": 359900,
      "renewalAmountCents": 399900
    },
    "coupon": {
      "code": "WELCOME20",
      "label": "首年优惠"
    },
    "providerAvailability": {
      "wechatpay": { "oneTime": true, "autoRenew": false },
      "alipay": { "oneTime": true, "autoRenew": false }
    }
  }
}
```

### 8.2 查询结算会话

```http
GET /api/billing/checkout-sessions/{sessionId}
```

返回当前报价、支付方式能力、最近一次支付尝试和最终订阅结果。

权限条件：

```text
session.userId = currentUser.id
AND session.workspaceId = currentWorkspace.id
```

### 8.3 应用优惠码

```http
PUT /api/billing/checkout-sessions/{sessionId}/coupon
Content-Type: application/json

{ "code": "WELCOME20" }
```

限制：只有 `ready` 状态且未过期的会话允许修改优惠。

成功后返回完整更新报价，不只返回优惠金额。

### 8.4 移除优惠码

```http
DELETE /api/billing/checkout-sessions/{sessionId}/coupon
```

### 8.5 确认支付

```http
POST /api/billing/checkout-sessions/{sessionId}/confirm
Idempotency-Key: <uuid>
Content-Type: application/json
```

请求：

```json
{
  "provider": "wechatpay",
  "autoRenew": true,
  "agreementAcceptedVersion": "auto-renew-v1.0"
}
```

校验：

- 会话属于当前用户和工作空间。
- 状态为 `ready` 或可重试的 `processing`。
- 会话未过期。
- 服务端重新计算报价，结果必须与快照一致。
- 渠道支持单次支付。
- 开启自动续期时，渠道必须支持自动续期。
- 开启自动续期时必须传协议版本。

微信响应：

```json
{
  "checkoutSession": { "id": "cm...", "status": "processing" },
  "payment": {
    "id": "cm...",
    "provider": "wechatpay",
    "status": "opened",
    "presentation": "qr_code",
    "codeUrl": "weixin://wxpay/...",
    "expiresAt": "2026-08-22T10:05:00.000Z"
  }
}
```

支付宝响应：

```json
{
  "checkoutSession": { "id": "cm...", "status": "processing" },
  "payment": {
    "id": "cm...",
    "provider": "alipay",
    "status": "opened",
    "presentation": "redirect",
    "redirectUrl": "https://openapi.alipay.com/..."
  }
}
```

### 8.6 关闭自动续期

```http
DELETE /api/billing/subscriptions/{subscriptionId}/auto-renew
Idempotency-Key: <uuid>
```

事务行为：

1. 校验订阅归属。
2. 调用渠道解约接口。
3. 将协议更新为 `revoked`。
4. 设置 `autoRenew = false`。
5. 设置 `cancelAtPeriodEnd = true`。
6. 取消尚未执行的续费尝试。

渠道解约暂时失败时返回 `202`，记录重试任务，但界面立即显示“正在关闭自动续期”，不得继续创建新扣款。

### 8.7 内部续费任务

```http
POST /api/internal/billing/renewals/run
Authorization: Bearer ${BILLING_CRON_SECRET}
```

该接口只允许服务器定时任务访问，每次处理固定批次，例如 50 条。

## 9. 支付渠道抽象

统一接口：

```ts
interface PaymentProviderAdapter {
  provider: BillingProvider;
  getCapabilities(): {
    oneTimePayment: boolean;
    recurringPayment: boolean;
    payAndSign: boolean;
  };

  createOneTimePayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  closePayment(input: ClosePaymentInput): Promise<void>;
  queryPayment(input: QueryPaymentInput): Promise<QueryPaymentResult>;
  verifyWebhook(input: RawWebhookInput): Promise<VerifiedProviderEvent>;

  createAgreement?(input: CreateAgreementInput): Promise<CreateAgreementResult>;
  queryAgreement?(input: QueryAgreementInput): Promise<QueryAgreementResult>;
  revokeAgreement?(input: RevokeAgreementInput): Promise<void>;
  chargeAgreement?(input: ChargeAgreementInput): Promise<ChargeAgreementResult>;
}
```

自动续期相关方法必须为能力检测后的可选方法。不得因为配置了单次支付密钥就认为自动续期可用。

建议新增环境变量：

```text
WECHATPAY_RECURRING_ENABLED=false
WECHATPAY_CONTRACT_TEMPLATE_ID=
WECHATPAY_CONTRACT_NOTIFY_URL=

ALIPAY_RECURRING_ENABLED=false
ALIPAY_AGREEMENT_PRODUCT_CODE=
ALIPAY_AGREEMENT_NOTIFY_URL=

BILLING_CRON_SECRET=
BILLING_CHECKOUT_TTL_MINUTES=30
BILLING_GRACE_PERIOD_DAYS=7
```

只有配置开关、必需凭据和渠道审批状态全部满足，`recurringPayment` 才返回 `true`。

## 10. 购买流程

### 10.1 套餐页

套餐卡片删除支付渠道选择，按钮统一为：

```text
立即订阅
升级套餐
续费套餐
```

点击后：

1. 调用创建结算会话接口。
2. 成功后跳转 `/checkout/{sessionId}`。
3. 失败时在套餐页展示可恢复错误。

### 10.2 收银台确认

```text
ready
  -> 用户选择支付渠道
  -> 用户选择是否自动续期
  -> 服务端确认最终报价
  -> 创建 PaymentOrder
  -> processing
```

微信二维码过期后，用户点击“刷新二维码”：

1. 关闭旧支付尝试。
2. 在同一结算会话下创建 `attemptNumber + 1` 的新支付尝试。
3. 不重复占用优惠名额。

支付宝跳转返回后只展示“支付结果确认中”，不得仅根据 `return_url` 参数激活订阅。

## 11. 支付回调与订阅激活

### 11.1 Webhook 基本原则

- 保留现有 `/api/billing/webhooks/[provider]`。
- 必须先验签，再读取业务数据。
- `PaymentEvent.providerEventId` 保持唯一。
- 验证商户号、AppID、订单号、币种和金额。
- 支付结果以渠道异步通知或服务端主动查单为准。
- 重复通知返回渠道要求的成功响应，不重复激活订阅。

### 11.2 初次购买事务

支付成功后在一个数据库事务中：

1. 锁定 `PaymentOrder`。
2. 如已是 `paid`，直接返回幂等成功。
3. 锁定 `CheckoutSession`。
4. 如其他支付尝试已经成功，将当前事件标记为异常并进入退款人工队列。
5. 验证支付金额等于 `CheckoutSession.amountDueCents`。
6. 更新订单为 `paid`。
7. 更新结算会话为 `completed`。
8. 优惠核销记录改为 `redeemed`。
9. 创建或更新订阅。
10. 若代扣协议已签约，关联 `PaymentAgreement` 并设置 `autoRenew = true`。
11. 计算 `currentPeriodStart`、`currentPeriodEnd` 和 `nextBillingAt`。
12. 标记 `PaymentEvent` 为 `processed`。

订阅周期按购买类型处理：

- `new`：从 `paidAt` 开始计算新周期。
- `upgrade`：从 `paidAt` 重新开始目标套餐周期。
- `manual_renewal`：保留当前周期起点，从现有 `currentPeriodEnd` 再延长一个周期。

### 11.3 升级规则

v1 升级支付成功后：

- 新套餐立即生效。
- `currentPeriodStart = paidAt`。
- `currentPeriodEnd = paidAt + 新套餐周期`。
- 不抵扣旧套餐剩余价值。
- 原自动续期协议不能直接跨渠道复用。
- 若新订单未完成代扣签约，升级后 `autoRenew = false`。

收银台必须明确展示“升级后新的订阅周期将从支付成功时开始，原套餐剩余周期不折算”。

## 12. 自动续期流程

### 12.1 签约

自动续期不是布尔开关，而是以下条件的组合：

```text
用户主动选择
+ 接受指定版本协议
+ 渠道签约成功
+ PaymentAgreement.status = active
+ Subscription.autoRenew = true
```

如果首笔支付成功但签约失败：

- 订阅正常按单次购买开通。
- `autoRenew = false`。
- 收银台成功页提示“订阅已开通，自动续期未开启”。

### 12.2 续费调度

定时任务每 15 分钟扫描：

```text
autoRenew = true
cancelAtPeriodEnd = false
status IN ('active', 'past_due')
nextBillingAt <= now
PaymentAgreement.status = active
```

认领任务必须使用数据库租约：

```text
lockedBy = worker id
lockedUntil = now + 5 minutes
```

使用 `FOR UPDATE SKIP LOCKED` 或等价 PostgreSQL 原子更新，避免多个实例重复扣款。

### 12.3 续费幂等键

```text
renewal:{subscriptionId}:{periodStart}:{attemptNumber}
```

渠道商户订单号和本地 `PaymentOrder.idempotencyKey` 都基于该键生成。

### 12.4 失败重试

| 尝试 | 时间 | 结果 |
|---|---|---|
| 1 | 到期日 | 失败后进入 `past_due`，设置宽限期 |
| 2 | 第 1 天 | 继续保留权益 |
| 3 | 第 3 天 | 最后自动尝试 |
| 结束 | 第 7 天 | 未支付则订阅 `expired`，停止付费权益 |

不可重试错误，例如协议已解约，应立即：

- 停止后续自动扣款。
- `autoRenew = false`。
- 协议更新为 `revoked` 或 `failed`。
- 通知用户改为手动续费。

### 12.5 续费成功

续费成功后：

- 从原 `currentPeriodEnd` 延长一个周期，避免回调延迟导致少算时间。
- 更新 `currentPeriodStart` 为原周期结束时间。
- 更新 `currentPeriodEnd` 为新周期结束时间。
- 清空 `gracePeriodEnd`。
- 状态恢复为 `active`。
- 计算下一次 `nextBillingAt`。
- 仅在本次续费实际使用多周期优惠时递减 `discountRemainingCycles`。

## 13. 状态机

### 13.1 CheckoutSession

```text
ready -> processing -> completed
ready -> expired
ready -> canceled
processing -> ready       支付失败后允许更换方式
processing -> failed      不可恢复错误
processing -> expired
```

### 13.2 PaymentOrder

```text
pending -> opened -> processing -> paid
pending -> failed
opened -> expired
opened -> canceled
processing -> failed
paid -> refunded
```

### 13.3 PaymentAgreement

```text
pending -> active
pending -> failed
active -> revoked
active -> expired
```

### 13.4 Subscription

```text
active -> past_due -> active
active -> canceled
active -> expired
past_due -> expired
```

所有状态变化必须通过领域服务函数完成，禁止 API route 直接随意更新状态字符串。

## 14. 收银台前端规格

### 14.1 页面区域

桌面端两栏，移动端单列：

```text
顶部：品牌标识、安全支付、返回套餐
左侧：套餐摘要、权益、优惠码、价格明细
右侧：支付方式、自动续期、协议、支付按钮
支付阶段：二维码或支付宝跳转状态
结果阶段：成功、失败、过期、签约部分成功
```

### 14.2 必须展示的信息

- 套餐名称和月付/年付。
- 当前工作空间。
- 原价、优惠、本次应付。
- 自动续期启用时的下次扣款日期和金额。
- 优惠只作用首期时明确展示“续费恢复 ¥X”。
- 升级不折算旧套餐时明确提示。
- 自动续期取消入口说明。

### 14.3 前端状态处理

- 页面首次加载查询服务端结算会话，不依赖路由携带报价。
- 微信支付状态每 2.5 秒轮询，页面不可见时暂停。
- 二维码剩余 60 秒时显示倒计时。
- 支付完成后停止轮询并跳转订阅成功页。
- 支付失败允许切换渠道，不创建新结算会话。
- 防止按钮双击，提交期间禁用确认按钮。
- 支持刷新页面恢复支付状态。

## 15. 安全与合规

- 客户端不得提交或覆盖订单金额。
- 所有对象查询必须同时校验 `userId` 和 `workspaceId`。
- 优惠码统一转大写并去除首尾空格后查询。
- 自动续期必须主动选择，不默认勾选。
- 记录协议版本、同意时间、IP 和 User-Agent。
- 支付渠道私钥、API 密钥和协议凭据只存环境变量或密钥服务。
- 不保存银行卡号、支付密码或可直接扣款的用户凭据。
- Webhook 原始报文可保存，但日志必须过滤密钥和个人敏感信息。
- 所有支付、优惠、解约和人工修复操作写审计日志。
- 自动扣款前通知、扣款时段和重试频率以渠道审核通过后的规则为准。

## 16. 可观测性

结构化日志至少包含：

```text
checkoutSessionId
paymentOrderId
subscriptionId
renewalAttemptId
provider
providerTransactionId
eventType
statusFrom
statusTo
errorCode
```

指标：

- `billing_checkout_created_total`
- `billing_checkout_completed_total`
- `billing_checkout_expired_total`
- `billing_coupon_apply_total`
- `billing_coupon_rejected_total`
- `billing_payment_success_total`
- `billing_payment_failure_total`
- `billing_webhook_invalid_total`
- `billing_agreement_active_total`
- `billing_renewal_success_total`
- `billing_renewal_failure_total`
- `billing_renewal_recovered_total`

告警：

- Webhook 连续验签失败。
- 支付成功但金额不一致。
- 一个结算会话出现两笔成功支付。
- 续费任务积压超过 30 分钟。
- 代扣成功但订阅未延长。

## 17. 迁移与兼容策略

项目尚未正式投产，不需要迁移历史业务数据，但仍采用可回滚的分步上线方式。

### M1：数据库与类型

- 新增结算、优惠、协议和续费模型。
- 扩展 `PaymentOrder` 和 `Subscription`。
- 执行 `prisma generate`。
- 增加状态机和报价纯函数单元测试。

### M2：统一单次支付收银台

- 新增 CheckoutSession API 和页面。
- 套餐页入口改为创建结算会话。
- 微信和支付宝适配器迁移到统一接口。
- 保留原 `/api/billing/checkout`，临时返回 `307` 语义对应的新接口结果或在一个版本后删除。
- 原 `/settings/billing/pay/[orderId]` 对新订单跳转至对应收银台。

### M3：优惠

- 增加优惠计算和核销。
- 增加内部优惠配置脚本或管理入口。
- 完成并发核销测试。

### M4：自动续期

- 完成渠道能力申请后再开启环境变量。
- 接入签约、解约和协议通知。
- 实现续费 scheduler、租约和重试。
- 增加订阅管理中的关闭自动续期入口。

### M5：灰度与正式启用

- 先对内部测试账号开放。
- 进行微信和支付宝真实小额支付。
- 验证首次购买、切换渠道、优惠、签约、解约和续费。
- 观察一个完整测试周期后再全量开放自动续期。

## 18. 代码任务拆分

### 18.1 数据与领域层

- 修改 Prisma schema。
- 新增 billing 类型。
- 实现 CheckoutSession 状态转换。
- 实现服务端报价函数。
- 实现优惠适用性和核销事务。
- 实现支付编排器。
- 重构支付回调 reconciliation。
- 实现协议领域服务。
- 实现续费任务和租约。

### 18.2 API 层

- 创建和查询结算会话。
- 应用和移除优惠码。
- 确认支付。
- 查询支付尝试。
- 关闭自动续期。
- 内部续费执行接口。
- 扩展微信和支付宝 webhook。

### 18.3 前端

- 新增收银台页面和组件。
- 修改套餐页 CTA。
- 实现二维码生命周期。
- 实现支付宝返回状态恢复。
- 实现自动续期条款展示。
- 实现成功、失败、过期和部分成功状态。
- 修改订阅管理页，展示续费状态和关闭入口。

### 18.4 运维

- 增加自动续期环境变量。
- 配置续费 cron。
- 配置代扣协议回调地址。
- 增加支付和续费告警。
- 建立小额真实支付巡检流程。

## 19. 测试计划

### 19.1 单元测试

- 月付和年付报价。
- 固定金额优惠。
- 百分比优惠和封顶金额。
- 优惠最低金额、有效期、套餐限制和使用次数。
- 金额最低保留 1 分。
- 结算会话状态机非法转换。
- 订阅周期按月和按年计算。
- 续费重试时间计算。

### 19.2 API 集成测试

- 未登录返回 401。
- 跨用户或跨工作空间访问返回 404。
- 重复 `Idempotency-Key` 返回同一结果。
- 过期会话不能确认支付。
- 不支持自动续期的渠道拒绝开启开关。
- 同一会话可切换支付渠道。
- 优惠码并发确认不会突破限额。
- 重复 webhook 只激活一次。
- 金额不一致不会开通订阅。
- 两个支付尝试同时成功时触发异常处理。

### 19.3 自动续期测试

- 签约成功后订阅开启自动续期。
- 支付成功但签约失败时只开通单次订阅。
- 用户关闭续期后当前周期仍有效。
- 到期任务只被一个 worker 认领。
- 扣款失败按 D0、D1、D3 重试。
- 宽限期内保持权益并显示 `past_due`。
- 续费成功从原周期结束时间延长。
- 协议解约通知关闭自动续期。

### 19.4 E2E

- 套餐页进入收银台。
- 输入优惠码后价格正确刷新。
- 微信二维码支付完成并自动跳转。
- 二维码过期后刷新。
- 支付宝跳转返回后恢复状态。
- 移动端收银台布局和底部支付按钮。
- 支付失败后切换渠道。
- 订阅页关闭自动续期。

## 20. 验收标准

满足以下全部条件才视为功能完成：

- 套餐页不再直接展示支付渠道。
- 微信和支付宝统一从独立收银台发起。
- 页面刷新后结算和支付状态可恢复。
- 所有支付金额均来自服务端报价快照。
- 优惠规则和核销具备并发保护。
- 重复回调不会重复开通或延长订阅。
- 一个结算会话不能产生两笔正常成功支付。
- 未获得代扣能力时不展示可用的自动续期开关。
- 自动续期有真实渠道协议记录，不复用交易号。
- 用户能够关闭自动续期且不影响当前周期。
- 续费任务支持幂等、租约、重试和宽限期。
- 微信和支付宝分别完成至少一笔真实小额支付验证。
- 自动续期启用前完成渠道签约、解约和至少一个缩短周期的完整扣款测试。

## 21. v1 非目标

- 多币种。
- 多个优惠叠加。
- 旧套餐剩余价值按比例抵扣。
- 套餐降级和下周期变更。
- 企业线下转账。
- 发票和税务系统集成。
- 支付宝花呗分期。
- 管理员手工改价。
- 跨工作空间共享优惠额度。

这些能力后续应基于 `CheckoutSession` 和 `PaymentOrder` 扩展，不应绕过统一报价与支付编排层。

## 22. 渠道实施前置资料

- 微信支付委托代扣接入流程：`https://pay.wechatpay.cn/doc/v2/merchant/4011986709`
- 微信支付周期扣费规则：`https://pay.wechatpay.cn/doc/v2/merchant/4011986682`
- 微信支付委托扣款模式：`https://pay.wechatpay.cn/doc/v2/merchant/4012205799`
- 支付宝开放平台产品文档：`https://open.alipay.com/productDocument.htm`

编码自动续期适配器前，必须以商户后台实际获批产品、模板和接口版本为准，将最终渠道字段映射补充到对应 adapter 的 README 和集成测试中。
