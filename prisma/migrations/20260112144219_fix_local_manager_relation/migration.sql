-- DropForeignKey
ALTER TABLE "public"."Local" DROP CONSTRAINT "Local_userId_fkey";

-- AlterTable
ALTER TABLE "Local" ADD COLUMN     "managerId" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "localId" INTEGER;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Local" ADD CONSTRAINT "Local_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
