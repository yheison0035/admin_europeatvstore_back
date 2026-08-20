-- Vencimiento y lote (drogueria/perecederos)
ALTER TABLE "Inventory" ADD COLUMN "expiryDate" TIMESTAMP(3);
ALTER TABLE "Inventory" ADD COLUMN "lot" TEXT;
