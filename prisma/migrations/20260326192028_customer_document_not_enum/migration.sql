/*
  Warnings:

  - A unique constraint covering the columns `[document,companyId]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."Customer_document_key";

-- CreateIndex
CREATE UNIQUE INDEX "Customer_document_companyId_key" ON "Customer"("document", "companyId");
