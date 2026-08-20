-- Cumpleaños y notas del cliente
ALTER TABLE "Customer" ADD COLUMN "birthday" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "notes" TEXT;
