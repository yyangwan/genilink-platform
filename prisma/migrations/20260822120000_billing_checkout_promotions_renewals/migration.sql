-- Independent checkout, promotions & auto-renewal (docs/billing-checkout-implementation-spec.md §6)

-- CreateTable
CREATE TABLE "CheckoutSession" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "idempotencyRequestHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "billingPlanId" TEXT NOT NULL,
    "sourceSubscriptionId" TEXT,
    "purchaseType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "amountDueCents" INTEGER NOT NULL,
    "renewalAmountCents" INTEGER NOT NULL,
    "planSnapshot" JSONB NOT NULL,
    "discountSnapshot" JSONB,
    "couponId" TEXT,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "agreementAcceptedVersion" TEXT,
    "agreementAcceptedAt" TIMESTAMP(3),
    "agreementAcceptedIp" TEXT,
    "agreementAcceptedUa" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discountType" TEXT NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "duration" TEXT NOT NULL DEFAULT 'once',
    "durationCycles" INTEGER,
    "minimumAmountCents" INTEGER,
    "maximumDiscountCents" INTEGER,
    "eligiblePlanKeys" JSONB,
    "eligibleBillingCycles" JSONB,
    "newCustomersOnly" BOOLEAN NOT NULL DEFAULT false,
    "maxRedemptions" INTEGER,
    "maxPerUser" INTEGER NOT NULL DEFAULT 1,
    "maxPerWorkspace" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "checkoutSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "discountCents" INTEGER NOT NULL,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAgreement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "checkoutSessionId" TEXT,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "providerAgreementId" TEXT,
    "providerUserId" TEXT,
    "providerTemplateId" TEXT,
    "agreementVersion" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "providerPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenewalAttempt" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "paymentOrderId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RenewalAttempt_pkey" PRIMARY KEY ("id")
);

-- AlterTable: PaymentOrder extensions
ALTER TABLE "PaymentOrder" ADD COLUMN "checkoutSessionId" TEXT;
ALTER TABLE "PaymentOrder" ADD COLUMN "orderType" TEXT NOT NULL DEFAULT 'initial';
ALTER TABLE "PaymentOrder" ADD COLUMN "attemptNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PaymentOrder" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "PaymentOrder" ADD COLUMN "idempotencyRequestHash" TEXT;
ALTER TABLE "PaymentOrder" ADD COLUMN "providerTransactionId" TEXT;
ALTER TABLE "PaymentOrder" ADD COLUMN "failureCode" TEXT;
ALTER TABLE "PaymentOrder" ADD COLUMN "failureMessage" TEXT;
ALTER TABLE "PaymentOrder" ADD COLUMN "closedAt" TIMESTAMP(3);

-- AlterTable: Subscription extensions
ALTER TABLE "Subscription" ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subscription" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Subscription" ADD COLUMN "paymentAgreementId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "nextBillingAt" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "gracePeriodEnd" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "renewalPriceCents" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "priceSnapshot" JSONB;
ALTER TABLE "Subscription" ADD COLUMN "discountSnapshot" JSONB;
ALTER TABLE "Subscription" ADD COLUMN "discountRemainingCycles" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_idempotencyKey_key" ON "CheckoutSession"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CheckoutSession_userId_workspaceId_status_idx" ON "CheckoutSession"("userId", "workspaceId", "status");

-- CreateIndex
CREATE INDEX "CheckoutSession_workspaceId_createdAt_idx" ON "CheckoutSession"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "CheckoutSession_expiresAt_status_idx" ON "CheckoutSession"("expiresAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_name_key" ON "Promotion"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_status_idx" ON "CouponRedemption"("couponId", "status");

-- CreateIndex
CREATE INDEX "CouponRedemption_userId_couponId_status_idx" ON "CouponRedemption"("userId", "couponId", "status");

-- CreateIndex
CREATE INDEX "CouponRedemption_workspaceId_couponId_status_idx" ON "CouponRedemption"("workspaceId", "couponId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_checkoutSessionId_key" ON "CouponRedemption"("checkoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAgreement_checkoutSessionId_key" ON "PaymentAgreement"("checkoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAgreement_providerAgreementId_key" ON "PaymentAgreement"("providerAgreementId");

-- CreateIndex
CREATE INDEX "PaymentAgreement_userId_workspaceId_provider_status_idx" ON "PaymentAgreement"("userId", "workspaceId", "provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RenewalAttempt_paymentOrderId_key" ON "RenewalAttempt"("paymentOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "RenewalAttempt_subscriptionId_periodStart_attemptNumber_key" ON "RenewalAttempt"("subscriptionId", "periodStart", "attemptNumber");

-- CreateIndex
CREATE INDEX "RenewalAttempt_status_scheduledAt_idx" ON "RenewalAttempt"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "RenewalAttempt_status_nextRetryAt_idx" ON "RenewalAttempt"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_idempotencyKey_key" ON "PaymentOrder"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_providerTransactionId_key" ON "PaymentOrder"("providerTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_checkoutSessionId_attemptNumber_key" ON "PaymentOrder"("checkoutSessionId", "attemptNumber");

-- CreateIndex
CREATE INDEX "PaymentOrder_checkoutSessionId_status_idx" ON "PaymentOrder"("checkoutSessionId", "status");

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_billingPlanId_fkey" FOREIGN KEY ("billingPlanId") REFERENCES "BillingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_sourceSubscriptionId_fkey" FOREIGN KEY ("sourceSubscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_checkoutSessionId_fkey" FOREIGN KEY ("checkoutSessionId") REFERENCES "CheckoutSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAgreement" ADD CONSTRAINT "PaymentAgreement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAgreement" ADD CONSTRAINT "PaymentAgreement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAgreement" ADD CONSTRAINT "PaymentAgreement_checkoutSessionId_fkey" FOREIGN KEY ("checkoutSessionId") REFERENCES "CheckoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalAttempt" ADD CONSTRAINT "RenewalAttempt_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenewalAttempt" ADD CONSTRAINT "RenewalAttempt_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_checkoutSessionId_fkey" FOREIGN KEY ("checkoutSessionId") REFERENCES "CheckoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_paymentAgreementId_fkey" FOREIGN KEY ("paymentAgreementId") REFERENCES "PaymentAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
