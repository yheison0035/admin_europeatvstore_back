-- Graduación manual de la tarjeta de fidelización
ALTER TABLE "Customer" ADD COLUMN "loyaltyManualComplete" BOOLEAN NOT NULL DEFAULT false;

-- Cargos al empleado (cuenta del barbero)
CREATE TYPE "EmployeeChargeType" AS ENUM ('MEMBRESIA', 'PRESTAMO', 'PRODUCTO', 'OTRO');

CREATE TABLE "EmployeeCharge" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "EmployeeChargeType" NOT NULL DEFAULT 'OTRO',
    "concept" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "settledMethod" TEXT,
    "settledAt" TIMESTAMP(3),
    "saleId" INTEGER,
    "createdById" INTEGER,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeCharge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeeCharge_companyId_idx" ON "EmployeeCharge"("companyId");
CREATE INDEX "EmployeeCharge_userId_idx" ON "EmployeeCharge"("userId");
CREATE INDEX "EmployeeCharge_status_idx" ON "EmployeeCharge"("status");
