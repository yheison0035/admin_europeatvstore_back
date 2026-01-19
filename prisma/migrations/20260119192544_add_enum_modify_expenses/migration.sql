/*
  Warnings:

  - You are about to drop the column `category` on the `Expense` table. All the data in the column will be lost.
  - Added the required column `type` to the `Expense` table without a default value. This is not possible if the table is not empty.
  - Made the column `localId` on table `Expense` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ExpenseType" AS ENUM ('ARRIENDO', 'SERVICIOS_PUBLICOS', 'EMPLEADOS', 'TRANSPORTE', 'PEDIDOS', 'PLAN_CELULAR', 'PLAN_INTERNET', 'ASEO', 'MANTENIMIENTO', 'PUBLICIDAD', 'IMPUESTOS', 'COMISIONES', 'OTROS');

-- DropForeignKey
ALTER TABLE "public"."Expense" DROP CONSTRAINT "Expense_localId_fkey";

-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "category",
ADD COLUMN     "paidTo" TEXT,
ADD COLUMN     "type" "ExpenseType" NOT NULL,
ALTER COLUMN "expenseDate" DROP DEFAULT,
ALTER COLUMN "localId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
