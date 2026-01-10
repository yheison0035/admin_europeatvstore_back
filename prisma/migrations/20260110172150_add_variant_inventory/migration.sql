/*
  Warnings:

  - You are about to drop the column `color` on the `Inventory` table. All the data in the column will be lost.
  - You are about to drop the column `sku` on the `Inventory` table. All the data in the column will be lost.
  - You are about to drop the column `stock` on the `Inventory` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."Inventory_sku_key";

-- AlterTable
ALTER TABLE "Inventory" DROP COLUMN "color",
DROP COLUMN "sku",
DROP COLUMN "stock",
ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "InventoryVariant" (
    "id" SERIAL NOT NULL,
    "color" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "sku" TEXT NOT NULL,
    "inventoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryVariant_sku_key" ON "InventoryVariant"("sku");

-- AddForeignKey
ALTER TABLE "InventoryVariant" ADD CONSTRAINT "InventoryVariant_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
