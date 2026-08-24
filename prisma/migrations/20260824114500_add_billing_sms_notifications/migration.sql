ALTER TABLE "User"
ADD COLUMN "renewalReminderSmsEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "BillingNotification" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "provider" TEXT NOT NULL DEFAULT 'aliyun',
    "templateCode" TEXT,
    "phoneMasked" TEXT,
    "phoneHash" TEXT,
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingNotification_subscriptionId_type_periodEnd_key"
ON "BillingNotification"("subscriptionId", "type", "periodEnd");

CREATE INDEX "BillingNotification_status_scheduledAt_idx"
ON "BillingNotification"("status", "scheduledAt");

CREATE INDEX "BillingNotification_userId_createdAt_idx"
ON "BillingNotification"("userId", "createdAt");

ALTER TABLE "BillingNotification"
ADD CONSTRAINT "BillingNotification_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingNotification"
ADD CONSTRAINT "BillingNotification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
