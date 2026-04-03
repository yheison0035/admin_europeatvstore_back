/*
  Warnings:

  - Made the column `companyId` on table `Brand` required. This step will fail if there are existing NULL values in that column.
  - Made the column `companyId` on table `Category` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."Brand" DROP CONSTRAINT "Brand_companyId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Category" DROP CONSTRAINT "Category_companyId_fkey";

-- AlterTable
ALTER TABLE "Brand" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "companyId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
