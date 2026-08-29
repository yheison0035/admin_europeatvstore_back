-- ¿La categoría genera comisión al empleado? (insumos sí, cervezas no)
ALTER TABLE "Category" ADD COLUMN "earnsCommission" BOOLEAN NOT NULL DEFAULT false;
