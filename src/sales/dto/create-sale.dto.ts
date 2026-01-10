import { IsArray, IsInt, IsNumber, IsOptional } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

class SaleItemDto {
  @IsInt()
  inventoryVariantId: number;

  @IsInt()
  quantity: number;
}

export class CreateSaleDto {
  @IsOptional()
  customerId?: number;

  @IsOptional()
  localId?: number;

  @IsOptional()
  paymentMethod?: PaymentMethod;

  @IsArray()
  items: SaleItemDto[];
}
