CREATE TABLE "ExpenseCategory" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "status" "Status" NOT NULL DEFAULT 'ACTIVO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExpenseCategory_companyId_idx" ON "ExpenseCategory"("companyId");

ALTER TABLE "Expense" ADD COLUMN "expenseCategoryId" INTEGER;
CREATE INDEX "Expense_expenseCategoryId_idx" ON "Expense"("expenseCategoryId");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
