import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Status } from '@prisma/client';

export class CreateInventoryDto {
  @IsString() sku: string;
  @IsString() name: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsNumber() stock?: number;
  @IsNumber() purchasePrice: number;
  @IsNumber() salePrice: number;
  @IsOptional() status?: Status;
  @IsOptional() @IsNumber() localId?: number;
  @IsOptional() @IsNumber() providerId?: number;
  @IsOptional() @IsNumber() categoryId?: number;
  @IsOptional() @IsNumber() brandId?: number;
}
