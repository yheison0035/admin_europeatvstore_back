-- Planes configurables (SUPER_PLATFORM). Idempotente.
CREATE TABLE IF NOT EXISTS "PlanConfig" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "emoji" TEXT,
  "tagline" TEXT,
  "priceMonthly" INTEGER NOT NULL DEFAULT 0,
  "order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "maxUsers" INTEGER,
  "maxLocals" INTEGER,
  "maxProducts" INTEGER,
  "maxCustomers" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanConfig_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "PlanModuleGate" (
  "moduleKey" TEXT NOT NULL,
  "minPlan" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanModuleGate_pkey" PRIMARY KEY ("moduleKey")
);
