-- Minutos desde medianoche para ordenar citas por hora de reloj
ALTER TABLE "Appointment" ADD COLUMN "startMinutes" INTEGER NOT NULL DEFAULT 0;
