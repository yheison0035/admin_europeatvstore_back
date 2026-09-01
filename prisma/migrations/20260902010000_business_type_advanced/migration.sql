ALTER TABLE "BusinessTypeConfig"
  ADD COLUMN "terminology" JSONB,
  ADD COLUMN "productFields" JSONB,
  ADD COLUMN "roles" TEXT[] DEFAULT ARRAY[]::TEXT[];
