/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Inventory` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Inventory_slug_key" ON "Inventory"("slug");
