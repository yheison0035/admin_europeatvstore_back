CREATE TABLE "CustomerSegment" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "status" "Status" NOT NULL DEFAULT 'ACTIVO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerSegment_companyId_idx" ON "CustomerSegment"("companyId");

ALTER TABLE "Customer" ADD COLUMN "segmentId" INTEGER;
CREATE INDEX "Customer_segmentId_idx" ON "Customer"("segmentId");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "CustomerSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
