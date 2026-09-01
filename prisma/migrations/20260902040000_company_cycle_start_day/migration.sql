ALTER TABLE "Company" ADD COLUMN "cycleStartDay" INTEGER NOT NULL DEFAULT 1;
-- RAGNOR BARBER: cierre del 3 al 2 del mes siguiente.
UPDATE "Company" SET "cycleStartDay"=3 WHERE name='RAGNOR BARBER';
