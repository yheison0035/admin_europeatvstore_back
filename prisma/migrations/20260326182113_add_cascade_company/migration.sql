-- DropForeignKey
ALTER TABLE "public"."Brand" DROP CONSTRAINT "Brand_companyId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Category" DROP CONSTRAINT "Category_companyId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Local" DROP CONSTRAINT "Local_companyId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Provider" DROP CONSTRAINT "Provider_companyId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Sale" DROP CONSTRAINT "Sale_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Sale" DROP CONSTRAINT "Sale_localId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Sale" DROP CONSTRAINT "Sale_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."User" DROP CONSTRAINT "User_companyId_fkey";

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Local" ADD CONSTRAINT "Local_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
