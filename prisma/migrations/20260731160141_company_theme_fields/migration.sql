-- Agrega columnas de tema que el schema ya declaraba pero faltaban en la BD.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "fontFamily" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "ctaColor" TEXT;
