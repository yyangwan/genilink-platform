-- DropForeignKey
ALTER TABLE "ExternalResourceMapping" DROP CONSTRAINT IF EXISTS "ExternalResourceMapping_projectId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "ExternalResourceMapping_projectId_service_key";

-- DropTable
DROP TABLE IF EXISTS "ExternalResourceMapping";
