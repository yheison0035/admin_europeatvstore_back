-- Recordatorio push de cita ya enviado al barbero
ALTER TABLE "Appointment" ADD COLUMN "reminderSent" BOOLEAN NOT NULL DEFAULT false;
