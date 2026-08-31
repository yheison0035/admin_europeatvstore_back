-- FactusConfig
CREATE TABLE "FactusConfig" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "environment" TEXT NOT NULL DEFAULT 'SANDBOX',
  "clientId" TEXT,
  "clientSecret" TEXT,
  "username" TEXT,
  "password" TEXT,
  "numberingRangeId" INTEGER,
  "paymentMethodCode" TEXT NOT NULL DEFAULT '10',
  "legalOrganizationId" TEXT NOT NULL DEFAULT '2',
  "tributeId" TEXT NOT NULL DEFAULT '21',
  "municipalityId" TEXT,
  "unitMeasureId" TEXT NOT NULL DEFAULT '70',
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "testedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FactusConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FactusConfig_companyId_key" ON "FactusConfig"("companyId");

-- ElectronicInvoice
CREATE TABLE "ElectronicInvoice" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "saleId" INTEGER NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'FACTUS',
  "number" TEXT,
  "cufe" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
  "qrUrl" TEXT,
  "pdfUrl" TEXT,
  "xmlUrl" TEXT,
  "validatedAt" TIMESTAMP(3),
  "error" TEXT,
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ElectronicInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ElectronicInvoice_saleId_key" ON "ElectronicInvoice"("saleId");
CREATE INDEX "ElectronicInvoice_companyId_idx" ON "ElectronicInvoice"("companyId");
