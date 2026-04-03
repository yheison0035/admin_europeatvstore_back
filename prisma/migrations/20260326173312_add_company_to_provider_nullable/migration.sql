-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "companyId" INTEGER;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
