CREATE TABLE "UnitOfMeasure" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL DEFAULT 'UNIDAD',
  "status" "Status" NOT NULL DEFAULT 'ACTIVO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UnitOfMeasure_companyId_idx" ON "UnitOfMeasure"("companyId");

ALTER TABLE "Inventory" ADD COLUMN "unitId" INTEGER;
CREATE INDEX "Inventory_unitId_idx" ON "Inventory"("unitId");
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;
