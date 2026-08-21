import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

// Abono / pago parcial de una venta a crédito (fiado).
export class CreateSalePaymentDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  // Fecha del abono (ISO). Opcional; por defecto ahora.
  @IsOptional()
  @IsString()
  paidAt?: string;
}
