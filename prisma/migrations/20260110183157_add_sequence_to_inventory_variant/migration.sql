/*
  Warnings:

  - A unique constraint covering the columns `[sequence]` on the table `InventoryVariant` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "InventoryVariant" ADD COLUMN     "sequence" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "InventoryVariant_sequence_key" ON "InventoryVariant"("sequence");
