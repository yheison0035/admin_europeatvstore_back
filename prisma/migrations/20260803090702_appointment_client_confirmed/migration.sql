-- Confirmación explícita con el cliente
ALTER TABLE "Appointment" ADD COLUMN "clientConfirmed" BOOLEAN NOT NULL DEFAULT false;
