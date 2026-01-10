/*
  Warnings:

  - You are about to drop the column `productId` on the `SaleItem` table. All the data in the column will be lost.
  - Added the required column `inventoryVariantId` to the `SaleItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."SaleItem" DROP CONSTRAINT "SaleItem_productId_fkey";

-- AlterTable
ALTER TABLE "SaleItem" DROP COLUMN "productId",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "inventoryVariantId" INTEGER NOT NULL,
ALTER COLUMN "quantity" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_inventoryVariantId_fkey" FOREIGN KEY ("inventoryVariantId") REFERENCES "InventoryVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
