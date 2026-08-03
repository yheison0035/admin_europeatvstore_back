-- Estado por defecto de las citas: CONFIRMADA (antes PENDIENTE)
ALTER TABLE "Appointment" ALTER COLUMN "status" SET DEFAULT 'CONFIRMADA';
