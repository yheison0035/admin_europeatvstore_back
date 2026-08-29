-- Venta sin comisión para el empleado (cortesía / mal aplicada)
ALTER TABLE "Sale" ADD COLUMN "noCommission" BOOLEAN NOT NULL DEFAULT false;
