CREATE TABLE "BankProcessedEmail" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankProcessedEmail_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BankProcessedEmail_companyId_sourceKey_key" ON "BankProcessedEmail"("companyId", "sourceKey");
CREATE INDEX "BankProcessedEmail_companyId_idx" ON "BankProcessedEmail"("companyId");
ALTER TABLE "BankProcessedEmail" ADD CONSTRAINT "BankProcessedEmail_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
