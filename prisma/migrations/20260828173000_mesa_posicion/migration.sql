-- Posición de cada mesa en el plano/maqueta del salón (px). Nullable: null = sin ubicar.
ALTER TABLE "Mesa" ADD COLUMN "posX" INTEGER;
ALTER TABLE "Mesa" ADD COLUMN "posY" INTEGER;
