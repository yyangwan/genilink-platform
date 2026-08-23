-- Fix historical drift: index present in schema since 20260527 migration but missing in live database.

-- CreateIndex
CREATE INDEX "ProjectBrand_projectId_idx" ON "ProjectBrand"("projectId");
