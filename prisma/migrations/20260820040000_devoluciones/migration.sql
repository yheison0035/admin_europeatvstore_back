CREATE TYPE "ReturnStatus" AS ENUM ('REGISTRADA', 'ANULADA');

CREATE TABLE "Return" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "reason" TEXT,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REGISTRADA',
    "saleId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReturnItem" (
    "id" SERIAL NOT NULL,
    "returnId" INTEGER NOT NULL,
    "saleItemId" INTEGER,
    "inventoryVariantId" INTEGER,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Return_companyId_idx" ON "Return"("companyId");
CREATE INDEX "Return_saleId_idx" ON "Return"("saleId");
CREATE INDEX "ReturnItem_returnId_idx" ON "ReturnItem"("returnId");
ALTER TABLE "Return" ADD CONSTRAINT "Return_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Return" ADD CONSTRAINT "Return_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Return" ADD CONSTRAINT "Return_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Return" ADD CONSTRAINT "Return_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE CASCADE ON UPDATE CASCADE;
