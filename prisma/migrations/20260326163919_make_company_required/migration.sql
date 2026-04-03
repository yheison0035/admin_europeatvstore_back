/*
  Warnings:

  - Made the column `companyId` on table `Local` required. This step will fail if there are existing NULL values in that column.
  - Made the column `companyId` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."Local" DROP CONSTRAINT "Local_companyId_fkey";

-- DropForeignKey
ALTER TABLE "public"."User" DROP CONSTRAINT "User_companyId_fkey";

-- AlterTable
ALTER TABLE "Local" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "companyId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Local" ADD CONSTRAINT "Local_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
