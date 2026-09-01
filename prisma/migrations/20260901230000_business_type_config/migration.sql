-- CreateTable
CREATE TABLE "BusinessTypeConfig" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessTypeConfig_type_key" ON "BusinessTypeConfig"("type");
