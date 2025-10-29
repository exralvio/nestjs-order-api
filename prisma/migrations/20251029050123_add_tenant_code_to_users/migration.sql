-- AlterTable
ALTER TABLE "users" ADD COLUMN "tenantCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantCode_key" ON "users"("tenantCode");

