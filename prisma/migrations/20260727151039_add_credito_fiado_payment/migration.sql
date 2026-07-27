-- Agrega el método de pago CREDITO y el estado de pago FIADO (venta a crédito)
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CREDITO';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'FIADO';
