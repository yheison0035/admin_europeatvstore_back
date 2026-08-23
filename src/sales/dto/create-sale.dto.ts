import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';
import { PaymentMethod, PaymentStatus, SaleStatus } from '@prisma/client';

export class CreateSaleItemDto {
  @IsOptional()
  @IsInt()
  inventoryVariantId?: number;

  @IsOptional()
  @IsInt()
  serviceId?: number;

  // Cantidad: entero para productos por unidad, decimal para venta por peso (kg).
  @IsNumber()
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

  // Opcional: venta de mostrador sin cliente => backend asigna Consumidor Final.
  @IsOptional()
  @IsInt()
  customerId?: number;

  @IsInt()
  localId: number;

  @IsInt()
  userId: number;

  @IsOptional()
  @IsDateString()
  saleDate?: string;

  // Vencimiento de la venta a crédito (fiado).
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Efectivo con el que pagó el cliente (para el cambio/vuelto en la factura).
  @IsOptional()
  @IsNumber()
  cashReceived?: number;

  @IsArray()
  @IsNotEmpty({ each: true })
  items: CreateSaleItemDto[];
}
