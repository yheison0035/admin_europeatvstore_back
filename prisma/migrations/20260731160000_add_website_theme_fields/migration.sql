-- Personalización de la tienda por empresa: tipografía y color de los CTA.
-- Aditiva y opcional: no afecta a ninguna empresa existente.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "fontFamily" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "ctaColor" TEXT;
