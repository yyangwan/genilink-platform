-- Generated from Prisma schema. Not applied to any live database.

CREATE TABLE "ProjectIntelligenceContext" (
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "contentHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectIntelligenceContext_pkey" PRIMARY KEY ("projectId")
);

CREATE TABLE "ProjectContextOutbox" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "ProjectContextOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectContextOutbox_projectId_deliveredAt_version_idx" ON "ProjectContextOutbox"("projectId", "deliveredAt", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectContextOutbox_projectId_version_key" ON "ProjectContextOutbox"("projectId", "version");

-- AddForeignKey
ALTER TABLE "ProjectIntelligenceContext" ADD CONSTRAINT "ProjectIntelligenceContext_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContextOutbox" ADD CONSTRAINT "ProjectContextOutbox_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
