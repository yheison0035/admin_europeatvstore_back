-- CreateTable
CREATE TABLE "ImpersonationLog" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "companyName" TEXT NOT NULL,
    "actorId" INTEGER NOT NULL,
    "actorEmail" TEXT,
    "targetUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImpersonationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImpersonationLog_createdAt_idx" ON "ImpersonationLog"("createdAt");

-- CreateIndex
CREATE INDEX "ImpersonationLog_companyId_idx" ON "ImpersonationLog"("companyId");
