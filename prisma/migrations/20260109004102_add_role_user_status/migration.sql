-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'COORDINADOR';
ALTER TYPE "Role" ADD VALUE 'AUXILIAR';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "name" SET DEFAULT 'SIN NOMBRE';

-- DropEnum
DROP TYPE "public"."UserStatus";
