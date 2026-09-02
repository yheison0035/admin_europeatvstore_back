-- Campos de facturación electrónica DIAN en el cliente. Idempotente.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "requiresEInvoice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "personType" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "taxResponsibility" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "municipalityCode" TEXT;
