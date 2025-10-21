import { PaymentMethod, Status } from '@prisma/client';
import {
  IsNumber,
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  ValidateNested,
  IsArray,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

class SaleItemDto {
  @IsNumber()
  productId: number;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  price: number;
}

export class CreateSaleDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsNumber()
  @Min(0)
  totalAmount: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsOptional()
  @IsDateString()
  saleDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  customerId?: number;

  @IsOptional()
  @IsNumber()
  localId?: number;

  @IsOptional()
  @IsNumber()
  userId?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];
}
