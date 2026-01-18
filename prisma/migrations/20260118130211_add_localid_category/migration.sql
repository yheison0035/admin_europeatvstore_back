-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "localId" INTEGER DEFAULT 1;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;
