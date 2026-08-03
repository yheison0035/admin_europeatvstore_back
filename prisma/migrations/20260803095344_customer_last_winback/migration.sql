-- Registro de última campaña de reactivación por cliente
ALTER TABLE "Customer" ADD COLUMN "lastWinbackAt" TIMESTAMP(3);
