/*
  Warnings:

  - Made the column `companyId` on table `Customer` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "companyId" SET NOT NULL;
