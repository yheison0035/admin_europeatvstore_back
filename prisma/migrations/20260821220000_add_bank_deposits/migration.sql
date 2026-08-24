-- Notificaciones de consignaciones al banco (SMS de Bancolombia reenviado).
ALTER TABLE "Company" ADD COLUMN "bankNotifyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN "bankNotifyToken" TEXT;
CREATE UNIQUE INDEX "Company_bankNotifyToken_key" ON "Company"("bankNotifyToken");

CREATE TABLE "BankDeposit" (
    "id" SERIAL NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "senderName" TEXT,
    "reference" TEXT,
    "raw" TEXT,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankDeposit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BankDeposit_companyId_idx" ON "BankDeposit"("companyId");
CREATE INDEX "BankDeposit_seen_idx" ON "BankDeposit"("seen");
ALTER TABLE "BankDeposit" ADD CONSTRAINT "BankDeposit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
