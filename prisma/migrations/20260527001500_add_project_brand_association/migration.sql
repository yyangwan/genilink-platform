-- CreateTable
CREATE TABLE "ProjectBrand" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectBrand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectBrand_brandId_idx" ON "ProjectBrand"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBrand_projectId_brandId_key" ON "ProjectBrand"("projectId", "brandId");

-- AddForeignKey
ALTER TABLE "ProjectBrand" ADD CONSTRAINT "ProjectBrand_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBrand" ADD CONSTRAINT "ProjectBrand_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
