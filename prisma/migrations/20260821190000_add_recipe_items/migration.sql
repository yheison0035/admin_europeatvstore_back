-- Recetas: qué insumos consume un plato del menú (para descontarlos al vender).

-- CreateTable
CREATE TABLE "RecipeItem" (
    "id" SERIAL NOT NULL,
    "inventoryId" INTEGER NOT NULL,
    "supplyId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeItem_inventoryId_idx" ON "RecipeItem"("inventoryId");

-- CreateIndex
CREATE INDEX "RecipeItem_supplyId_idx" ON "RecipeItem"("supplyId");

-- CreateIndex
CREATE INDEX "RecipeItem_companyId_idx" ON "RecipeItem"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeItem_inventoryId_supplyId_key" ON "RecipeItem"("inventoryId", "supplyId");

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_supplyId_fkey" FOREIGN KEY ("supplyId") REFERENCES "Supply"("id") ON DELETE CASCADE ON UPDATE CASCADE;
