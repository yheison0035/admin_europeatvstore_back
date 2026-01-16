/*
  Warnings:

  - You are about to drop the column `status` on the `Sale` table. All the data in the column will be lost.
  - Made the column `paymentMethod` on table `Sale` required. This step will fail if there are existing NULL values in that column.
  - Made the column `customerId` on table `Sale` required. This step will fail if there are existing NULL values in that column.
  - Made the column `localId` on table `Sale` required. This step will fail if there are existing NULL values in that column.
  - Made the column `userId` on table `Sale` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."Sale" DROP CONSTRAINT "Sale_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Sale" DROP CONSTRAINT "Sale_localId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Sale" DROP CONSTRAINT "Sale_userId_fkey";

-- AlterTable
ALTER TABLE "Sale" DROP COLUMN "status",
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "saleStatus" "SaleStatus" NOT NULL DEFAULT 'NUEVA',
ALTER COLUMN "paymentMethod" SET NOT NULL,
ALTER COLUMN "customerId" SET NOT NULL,
ALTER COLUMN "localId" SET NOT NULL,
ALTER COLUMN "userId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
