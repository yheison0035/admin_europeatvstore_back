-- Alerta de stock bajo por producto
ALTER TABLE "Inventory" ADD COLUMN "minStock" INTEGER NOT NULL DEFAULT 0;
