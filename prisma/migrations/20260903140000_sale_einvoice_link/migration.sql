-- Vínculo venta ↔ factura electrónica DIAN. Idempotente.
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "eInvoiceDocId" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "eInvoiceNumber" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "eInvoiceStatus" TEXT;
