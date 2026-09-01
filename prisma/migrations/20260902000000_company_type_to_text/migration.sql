-- Company.type: enum BusinessType -> TEXT (permite tipos de negocio nuevos).
-- El enum "BusinessType" se conserva en la BD como catálogo de referencia.
ALTER TABLE "Company" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Company" ALTER COLUMN "type" TYPE TEXT USING "type"::text;
ALTER TABLE "Company" ALTER COLUMN "type" SET DEFAULT 'COMERCIO';
