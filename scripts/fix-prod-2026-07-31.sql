-- ============================================================
-- URGENTE · Restaurar producción (2026-07-31)
--
-- El deploy 1e2ebce subió el schema con Coupon + Company.couponCode,
-- pero la BD de producción NO tiene esas columnas/tablas. Como el deploy
-- no corre migraciones, Prisma falla en CUALQUIER consulta a Company y
-- toda la API responde 500 (tienda y CRM caídos).
--
-- Ejecutar tal cual contra la BD de producción (DATABASE_PUBLIC_URL).
-- Es idempotente: se puede correr más de una vez sin romper nada.
-- ============================================================

-- 1) Migración de cupones (20260731152252_add_coupons)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DiscountType') THEN
    CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');
  END IF;
END$$;

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "couponCode" TEXT;

CREATE TABLE IF NOT EXISTS "Coupon" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENT',
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "appliesToPlan" TEXT,
    "maxRedemptions" INTEGER,
    "timesRedeemed" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" "Status" NOT NULL DEFAULT 'ACTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_code_key" ON "Coupon"("code");

-- 2) Personalización de la tienda (20260731160000_add_website_theme_fields)
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "fontFamily" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "ctaColor" TEXT;

-- 3) Registrar las migraciones como aplicadas (flujo manual del proyecto)
INSERT INTO "_prisma_migrations" (
  id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count
)
SELECT
  gen_random_uuid()::text, '', now(), '20260731152252_add_coupons', NULL, NULL, now(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20260731152252_add_coupons'
);

INSERT INTO "_prisma_migrations" (
  id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count
)
SELECT
  gen_random_uuid()::text, '', now(), '20260731160000_add_website_theme_fields', NULL, NULL, now(), 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20260731160000_add_website_theme_fields'
);

-- 4) Comprobación
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'Company'
  AND column_name IN ('couponCode', 'fontFamily', 'ctaColor');
