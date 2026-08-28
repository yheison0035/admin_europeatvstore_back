-- Correo propio (SMTP) por empresa para envíos con su propia cuenta
ALTER TABLE "Company" ADD COLUMN "mailHost" TEXT;
ALTER TABLE "Company" ADD COLUMN "mailPort" INTEGER;
ALTER TABLE "Company" ADD COLUMN "mailUser" TEXT;
ALTER TABLE "Company" ADD COLUMN "mailPassword" TEXT;
ALTER TABLE "Company" ADD COLUMN "mailFromName" TEXT;
ALTER TABLE "Company" ADD COLUMN "mailFromEmail" TEXT;
