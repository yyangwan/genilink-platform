-- DropIndex
DROP INDEX "UsageEvent_workspaceId_feature_periodStart_idx";

-- AlterTable
ALTER TABLE "UsageEvent" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "operationId" TEXT,
ADD COLUMN     "requestHash" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'committed';

-- CreateIndex
CREATE INDEX "UsageEvent_workspaceId_feature_periodStart_status_idx" ON "UsageEvent"("workspaceId", "feature", "periodStart", "status");

-- CreateIndex
CREATE INDEX "UsageEvent_status_expiresAt_idx" ON "UsageEvent"("status", "expiresAt");

-- CreateIndex(手工追加，Prisma 不支持部分索引)
-- 同一工作空间同一功能下，非空 operationId 唯一：预占幂等与对账的数据库保证（设计 §8.7）。
CREATE UNIQUE INDEX "usage_event_workspace_feature_operation_unique"
ON "UsageEvent" ("workspaceId", "feature", "operationId")
WHERE "operationId" IS NOT NULL;
