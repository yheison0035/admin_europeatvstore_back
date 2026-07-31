-- Campos de facturación/suscripción de la plataforma
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "plan" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "paidUntil" TIMESTAMP(3);
