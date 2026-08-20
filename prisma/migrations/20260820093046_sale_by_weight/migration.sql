-- Venta por peso: unidad de venta + stock/quantity con decimales
ALTER TABLE "Inventory" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'UNIDAD';
ALTER TABLE "InventoryVariant" ALTER COLUMN "stock" TYPE DOUBLE PRECISION;
ALTER TABLE "SaleItem" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;
