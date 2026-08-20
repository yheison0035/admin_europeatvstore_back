CREATE TYPE "CashRegisterStatus" AS ENUM ('ABIERTA', 'CERRADA');
CREATE TYPE "CashMovementType" AS ENUM ('INGRESO', 'EGRESO');

CREATE TABLE "CashRegister" (
    "id" SERIAL NOT NULL,
    "status" "CashRegisterStatus" NOT NULL DEFAULT 'ABIERTA',
    "openingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "countedAmount" DOUBLE PRECISION,
    "expectedAmount" DOUBLE PRECISION,
    "difference" DOUBLE PRECISION,
    "notes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "localId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "openedById" INTEGER,
    "closedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CashMovement" (
    "id" SERIAL NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "concept" TEXT,
    "cashRegisterId" INTEGER NOT NULL,
    "saleId" INTEGER,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashRegister_companyId_idx" ON "CashRegister"("companyId");
CREATE INDEX "CashRegister_localId_idx" ON "CashRegister"("localId");
CREATE INDEX "CashRegister_status_idx" ON "CashRegister"("status");
CREATE INDEX "CashMovement_cashRegisterId_idx" ON "CashMovement"("cashRegisterId");

ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
