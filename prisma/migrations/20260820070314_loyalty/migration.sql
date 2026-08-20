-- Fidelizacion (tarjeta de sellos)
ALTER TABLE "Company" ADD COLUMN "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN "loyaltyStampsRequired" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Company" ADD COLUMN "loyaltyReward" TEXT NOT NULL DEFAULT '1 servicio gratis';
ALTER TABLE "Customer" ADD COLUMN "loyaltyStamps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN "loyaltyRewards" INTEGER NOT NULL DEFAULT 0;
