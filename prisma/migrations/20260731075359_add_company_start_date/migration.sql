-- Fecha en que la empresa empezó con nosotros (si null, se usa createdAt)
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
