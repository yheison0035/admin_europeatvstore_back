import {
  IsEnum,
  IsOptional,
  IsString,
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

  @IsOptional()
  @IsString()
  wompiTransactionId?: string;

  @IsOptional()
  @IsString()
  wompiReference?: string;

  @IsOptional()
  wompiPayload?: any;
}
