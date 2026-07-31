-- Código OTP para restablecer contraseña por WhatsApp. Aditivo.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetOtpHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetOtpExpires" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetOtpAttempts" INTEGER NOT NULL DEFAULT 0;
