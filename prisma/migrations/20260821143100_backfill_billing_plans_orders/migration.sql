-- Backfill: restore schema changes that reached prisma/schema.prisma via
-- commits 02acc2f / d7e1ccc without accompanying migration files
-- (BillingPlan, PaymentOrder, PaymentEvent, Subscription billing columns).

-- CreateTable
CREATE TABLE "BillingPlan" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "provider" TEXT NOT NULL,
    "providerPriceId" TEXT,
    "checkoutUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "billingPlanId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerSessionId" TEXT,
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "status" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "checkoutUrl" TEXT,
    "successUrl" TEXT,
    "cancelUrl" TEXT,
    "metadata" JSONB,
    "paidAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "paymentOrderId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingPlan_key_key" ON "BillingPlan"("key");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPlan_providerPriceId_key" ON "BillingPlan"("providerPriceId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_providerSessionId_key" ON "PaymentOrder"("providerSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_providerSubscriptionId_key" ON "PaymentOrder"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "PaymentOrder_userId_workspaceId_module_status_idx" ON "PaymentOrder"("userId", "workspaceId", "module", "status");

-- CreateIndex
CREATE INDEX "PaymentOrder_provider_providerSessionId_idx" ON "PaymentOrder"("provider", "providerSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "PaymentEvent_provider_eventType_idx" ON "PaymentEvent"("provider", "eventType");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentOrderId_idx" ON "PaymentEvent"("paymentOrderId");

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_billingPlanId_fkey" FOREIGN KEY ("billingPlanId") REFERENCES "BillingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "billingPlanId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "provider" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "providerCustomerId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "providerSubscriptionId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "paymentOrderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_paymentOrderId_key" ON "Subscription"("paymentOrderId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_billingPlanId_fkey" FOREIGN KEY ("billingPlanId") REFERENCES "BillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
