-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "updatedById" INTEGER;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
