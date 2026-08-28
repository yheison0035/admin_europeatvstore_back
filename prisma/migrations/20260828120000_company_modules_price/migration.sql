-- Control manual de módulos por empresa + precio y descuento (superplatform)
ALTER TABLE "Company" ADD COLUMN "enabledModules" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Company" ADD COLUMN "monthlyPrice" INTEGER;
ALTER TABLE "Company" ADD COLUMN "discountedPrice" INTEGER;
ALTER TABLE "Company" ADD COLUMN "discountUntil" TIMESTAMP(3);
