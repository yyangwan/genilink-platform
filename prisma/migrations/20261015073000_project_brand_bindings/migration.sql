-- Static schema change only; not applied to a live database.

ALTER TABLE "ProjectBrand" ADD COLUMN "analysisRole" TEXT NOT NULL DEFAULT 'registered', ADD COLUMN "entityId" TEXT, ADD COLUMN "identityVersion" INTEGER;

CREATE TABLE "ProjectBrandReviewEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "entityId" TEXT,
    "identityVersion" INTEGER,
    "analysisRole" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "contextVersion" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectBrandReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectBrandReviewEvent_projectId_brandId_createdAt_idx" ON "ProjectBrandReviewEvent"("projectId", "brandId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBrandReviewEvent_projectId_idempotencyKey_key" ON "ProjectBrandReviewEvent"("projectId", "idempotencyKey");
