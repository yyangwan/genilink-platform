-- AlterTable
ALTER TABLE "MarketingLead" ADD COLUMN     "websiteQuickCheckId" TEXT;

-- CreateTable
CREATE TABLE "WebsiteQuickCheck" (
    "id" TEXT NOT NULL,
    "acquisitionSessionId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "targetUrl" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" JSONB,
    "errorCode" TEXT,
    "leaseId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "WebsiteQuickCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebsiteQuickCheck_ownerUserId_createdAt_idx" ON "WebsiteQuickCheck"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "WebsiteQuickCheck_expiresAt_idx" ON "WebsiteQuickCheck"("expiresAt");

-- CreateIndex
CREATE INDEX "WebsiteQuickCheck_leaseUntil_idx" ON "WebsiteQuickCheck"("leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteQuickCheck_acquisitionSessionId_idempotencyKey_key" ON "WebsiteQuickCheck"("acquisitionSessionId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "WebsiteQuickCheck" ADD CONSTRAINT "WebsiteQuickCheck_acquisitionSessionId_fkey" FOREIGN KEY ("acquisitionSessionId") REFERENCES "AcquisitionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteQuickCheck" ADD CONSTRAINT "WebsiteQuickCheck_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingLead" ADD CONSTRAINT "MarketingLead_websiteQuickCheckId_fkey" FOREIGN KEY ("websiteQuickCheckId") REFERENCES "WebsiteQuickCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;
