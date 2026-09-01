CREATE TABLE "ClinicalRecord" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "bloodType" TEXT,
    "allergies" TEXT,
    "medications" TEXT,
    "conditions" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClinicalRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClinicalRecord_companyId_customerId_key" ON "ClinicalRecord"("companyId", "customerId");

CREATE TABLE "ClinicalEntry" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "appointmentId" INTEGER,
    "userId" INTEGER,
    "userName" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "diagnosis" TEXT,
    "treatment" TEXT,
    "notes" TEXT,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicalEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClinicalEntry_companyId_customerId_idx" ON "ClinicalEntry"("companyId", "customerId");
