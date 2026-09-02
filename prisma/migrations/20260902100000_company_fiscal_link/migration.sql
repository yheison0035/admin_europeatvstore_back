-- Vínculo de la empresa con la Pegazo Fiscal API (integración directa DIAN).
-- Idempotente: seguro de aplicar más de una vez.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "fiscalCompanyId" TEXT;
