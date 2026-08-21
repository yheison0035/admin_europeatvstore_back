-- companyId en Inventory (blindaje multi-tenant) + backfill + indices de rendimiento

ALTER TABLE "Inventory" ADD COLUMN "companyId" INTEGER;

-- Backfill: por local, luego por categoria, luego por marca
UPDATE "Inventory" i SET "companyId" = l."companyId"
  FROM "Local" l WHERE l.id = i."localId" AND i."companyId" IS NULL;
UPDATE "Inventory" i SET "companyId" = c."companyId"
  FROM "Category" c WHERE c.id = i."categoryId" AND i."companyId" IS NULL AND c."companyId" IS NOT NULL;
UPDATE "Inventory" i SET "companyId" = b."companyId"
  FROM "Brand" b WHERE b.id = i."brandId" AND i."companyId" IS NULL AND b."companyId" IS NOT NULL;

-- FK (nullable: quedan pocos huerfanos irrecuperables)
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indices Inventory
CREATE INDEX "Inventory_companyId_idx" ON "Inventory"("companyId");
CREATE INDEX "Inventory_localId_idx" ON "Inventory"("localId");
CREATE INDEX "Inventory_categoryId_idx" ON "Inventory"("categoryId");
CREATE INDEX "Inventory_brandId_idx" ON "Inventory"("brandId");
CREATE INDEX "Inventory_providerId_idx" ON "Inventory"("providerId");
CREATE INDEX "Inventory_status_idx" ON "Inventory"("status");

-- Indices SaleItem
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");
CREATE INDEX "SaleItem_inventoryVariantId_idx" ON "SaleItem"("inventoryVariantId");
CREATE INDEX "SaleItem_serviceId_idx" ON "SaleItem"("serviceId");

-- Indices Expense
CREATE INDEX "Expense_localId_idx" ON "Expense"("localId");
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");
CREATE INDEX "Expense_type_idx" ON "Expense"("type");
