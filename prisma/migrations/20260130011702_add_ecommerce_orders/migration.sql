-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('CRM', 'ECOMMERCE');

-- CreateEnum
CREATE TYPE "ShippingStatus" AS ENUM ('PENDIENTE', 'ASIGNADO_TRANSPORTADORA', 'EN_CAMINO', 'ENTREGADO', 'DEVUELTO', 'FALLIDO');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "ecommerceCustomerId" INTEGER,
ADD COLUMN     "shippingStatus" "ShippingStatus" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'CRM',
ADD COLUMN     "wompiPayload" JSONB,
ADD COLUMN     "wompiReference" TEXT,
ADD COLUMN     "wompiStatus" TEXT,
ADD COLUMN     "wompiTransactionId" TEXT;

-- CreateTable
CREATE TABLE "EcommerceCustomer" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "documentNumber" TEXT,
    "department" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "addressDetail" TEXT,
    "neighborhood" TEXT,
    "billingSameAsShipping" BOOLEAN NOT NULL DEFAULT true,
    "billingFirstName" TEXT,
    "billingLastName" TEXT,
    "billingPhone" TEXT,
    "billingAddress" TEXT,
    "isHardToAccess" BOOLEAN NOT NULL DEFAULT false,
    "localId" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcommerceCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" SERIAL NOT NULL,
    "saleId" INTEGER NOT NULL,
    "status" "ShippingStatus" NOT NULL DEFAULT 'PENDIENTE',
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EcommerceCustomer_email_key" ON "EcommerceCustomer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_saleId_key" ON "Shipment"("saleId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_ecommerceCustomerId_fkey" FOREIGN KEY ("ecommerceCustomerId") REFERENCES "EcommerceCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
