CREATE TABLE "Payable" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "concept" TEXT NOT NULL,
    "paidTo" TEXT,
    "type" "ExpenseType" NOT NULL DEFAULT 'OTROS',
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "paidAt" TIMESTAMP(3),
    "paymentMethod" "PaymentMethod",
    "expenseId" INTEGER,
    "createdById" INTEGER,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Payable_companyId_idx" ON "Payable"("companyId");
CREATE INDEX "Payable_status_idx" ON "Payable"("status");
