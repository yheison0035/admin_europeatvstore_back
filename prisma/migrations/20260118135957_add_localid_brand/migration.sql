-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "localId" INTEGER;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;
