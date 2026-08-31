CREATE TABLE "PaymentMethodCatalog" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "code" "PaymentMethod" NOT NULL,
  "status" "Status" NOT NULL DEFAULT 'ACTIVO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentMethodCatalog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentMethodCatalog_companyId_idx" ON "PaymentMethodCatalog"("companyId");

ALTER TABLE "Sale" ADD COLUMN "paymentMethodCatalogId" INTEGER;
CREATE INDEX "Sale_paymentMethodCatalogId_idx" ON "Sale"("paymentMethodCatalogId");
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_paymentMethodCatalogId_fkey" FOREIGN KEY ("paymentMethodCatalogId") REFERENCES "PaymentMethodCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
