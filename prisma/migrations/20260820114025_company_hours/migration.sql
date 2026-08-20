-- Horario de atencion de la empresa
ALTER TABLE "Company" ADD COLUMN "openHour" INTEGER NOT NULL DEFAULT 9;
ALTER TABLE "Company" ADD COLUMN "closeHour" INTEGER NOT NULL DEFAULT 20;
