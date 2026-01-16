/*
  Warnings:

  - The values [NEQUI,OTRO] on the enum `PaymentMethod` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDIENTE', 'EN_VALIDACION', 'PLAN_SEPARE', 'PAGADA', 'RECHAZADA', 'VENCIDO', 'REEMBOLSADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('NUEVA', 'EN_PROCESO', 'PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA', 'FACTURADA', 'DESPACHADA', 'ENTREGADA', 'DEVUELTA');

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentMethod_new" AS ENUM ('EFECTIVO', 'BANCOLOMBIA', 'TRANSFERENCIA', 'DATAFONO', 'ADDI');
ALTER TABLE "Expense" ALTER COLUMN "paymentMethod" TYPE "PaymentMethod_new" USING ("paymentMethod"::text::"PaymentMethod_new");
ALTER TABLE "Sale" ALTER COLUMN "paymentMethod" TYPE "PaymentMethod_new" USING ("paymentMethod"::text::"PaymentMethod_new");
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
DROP TYPE "public"."PaymentMethod_old";
COMMIT;
