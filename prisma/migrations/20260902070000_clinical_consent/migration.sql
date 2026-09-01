CREATE TABLE "ClinicalConsent" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "signatureUrl" TEXT,
    "userName" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicalConsent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClinicalConsent_companyId_customerId_idx" ON "ClinicalConsent"("companyId", "customerId");
