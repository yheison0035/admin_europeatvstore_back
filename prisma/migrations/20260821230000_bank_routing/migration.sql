-- Enrutar consignaciones por empresa cuando varias comparten el mismo buzón.
DROP INDEX IF EXISTS "Company_bankNotifyToken_key";
ALTER TABLE "Company" ADD COLUMN "bankIdentifier" TEXT;
