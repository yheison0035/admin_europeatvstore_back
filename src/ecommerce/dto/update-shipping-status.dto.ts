import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ShippingStatus } from '@prisma/client';

export class UpdateShippingStatusDto {
  @IsEnum(ShippingStatus)
  status: ShippingStatus;

  @IsOptional()
  @IsString()
  carrier?: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
