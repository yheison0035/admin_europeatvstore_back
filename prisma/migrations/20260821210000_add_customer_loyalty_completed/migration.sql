-- Cliente "graduado" de fidelización (completó el rango; fidelización off).
ALTER TABLE "Customer" ADD COLUMN "loyaltyCompleted" BOOLEAN NOT NULL DEFAULT false;
