import {
  IsEnum,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';
import { EcommerceCustomerDto } from './ecommerce-customer.dto';
import { EcommerceOrderItemDto } from './ecommerce-order-item.dto';

export class CreateEcommerceOrderDto {
  @ValidateNested()
  @Type(() => EcommerceCustomerDto)
  customer: EcommerceCustomerDto;

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EcommerceOrderItemDto)
  items: EcommerceOrderItemDto[];

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  // Costo de envío calculado en la tienda; se suma al total del pedido.
  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  // Modo de entrega: shipping | local_delivery | pickup | dine_in.
  @IsOptional()
  @IsString()
  deliveryMethod?: string;

  // Notas del cliente (ej. referencias, nº de mesa, instrucciones).
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  wompiTransactionId?: string;

  @IsOptional()
  @IsString()
  wompiReference?: string;

  @IsOptional()
  wompiPayload?: any;
}
