CREATE TABLE "ChargeCategory" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "status" "Status" NOT NULL DEFAULT 'ACTIVO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChargeCategory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChargeCategory_companyId_idx" ON "ChargeCategory"("companyId");

ALTER TABLE "EmployeeCharge" ADD COLUMN "chargeCategoryId" INTEGER;
CREATE INDEX "EmployeeCharge_chargeCategoryId_idx" ON "EmployeeCharge"("chargeCategoryId");
ALTER TABLE "EmployeeCharge" ADD CONSTRAINT "EmployeeCharge_chargeCategoryId_fkey" FOREIGN KEY ("chargeCategoryId") REFERENCES "ChargeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
