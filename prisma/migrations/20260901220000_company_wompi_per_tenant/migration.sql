-- AlterTable
ALTER TABLE "Company"
  ADD COLUMN "wompiEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "wompiPublicKey" TEXT,
  ADD COLUMN "wompiIntegritySecret" TEXT,
  ADD COLUMN "wompiEventsSecret" TEXT,
  ADD COLUMN "wompiPrivateKey" TEXT;
