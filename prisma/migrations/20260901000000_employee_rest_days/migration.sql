ALTER TABLE "User" ADD COLUMN "restWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

CREATE TABLE "EmployeeTimeOff" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeTimeOff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmployeeTimeOff_userId_date_key" ON "EmployeeTimeOff"("userId","date");
CREATE INDEX "EmployeeTimeOff_companyId_idx" ON "EmployeeTimeOff"("companyId");
ALTER TABLE "EmployeeTimeOff" ADD CONSTRAINT "EmployeeTimeOff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
