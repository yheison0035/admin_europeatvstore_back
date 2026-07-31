import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';
import {
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
  InvoiceType,
} from '@prisma/client';

export class CreateSaleItemDto {
  @IsOptional()
  @IsInt()
  inventoryVariantId?: number;

  @IsOptional()
  @IsInt()
  serviceId?: number;

  @IsInt()
  quantity: number;

  @IsOptional()
  discount?: number;
}

export class CreateSaleDto {
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsEnum(PaymentStatus)
  @IsOptional()
  paymentStatus: PaymentStatus;

  @IsEnum(SaleStatus)
  @IsOptional()
  saleStatus?: SaleStatus;

  // NORMAL (sin IVA) o ELECTRONICA (suma IVA sobre el subtotal)
  @IsEnum(InvoiceType)
  @IsOptional()
  invoiceType?: InvoiceType;

  @IsInt()
  customerId: number;

  @IsInt()
  localId: number;

  @IsInt()
  userId: number;

  @IsOptional()
  @IsDateString()
  saleDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @IsNotEmpty({ each: true })
  items: CreateSaleItemDto[];
}
