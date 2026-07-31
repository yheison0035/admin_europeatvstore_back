-- Datos fiscales del emisor (config por empresa, estilo Alegra/Siigo). Aditivo.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "businessName" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "dv" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "personType" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "taxRegime" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "ciiu" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "fiscalAddress" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "fiscalCity" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "defaultTaxRate" DECIMAL(5,2) NOT NULL DEFAULT 0;
