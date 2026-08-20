-- Tema de diseño del CRM por empresa
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "crmTheme" TEXT NOT NULL DEFAULT 'orange';
