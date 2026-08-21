-- Control de inventario por producto (platos sin stock vs bebidas con stock)
ALTER TABLE "Inventory" ADD COLUMN "trackStock" BOOLEAN NOT NULL DEFAULT true;
