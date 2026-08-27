-- Origen del cliente + login de tienda online (identidad unificada en Customer)
CREATE TYPE "CustomerSource" AS ENUM ('CRM', 'ECOMMERCE');

ALTER TABLE "Customer" ADD COLUMN "source" "CustomerSource" NOT NULL DEFAULT 'CRM';
ALTER TABLE "Customer" ADD COLUMN "password" TEXT;

ALTER TABLE "EcommerceCustomer" ADD COLUMN "customerId" INTEGER;
ALTER TABLE "EcommerceCustomer"
  ADD CONSTRAINT "EcommerceCustomer_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
