/*
  Warnings:

  - Made the column `companyId` on table `Provider` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."Provider" DROP CONSTRAINT "Provider_companyId_fkey";

-- AlterTable
ALTER TABLE "Provider" ALTER COLUMN "companyId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
