import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Status } from '@prisma/client';

class VariantDto {
  @IsString()
  color: string;

  @IsNumber()
  stock: number;
}

export class CreateInventoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  purchasePrice: number;

  @IsOptional()
  @IsNumber()
  oldPrice?: number;

  @IsNumber()
  salePrice: number;

  @IsOptional()
  status?: Status;

  @IsOptional()
  localId?: number;

  @IsOptional()
  providerId?: number;

  @IsOptional()
  categoryId?: number;

  @IsOptional()
  brandId?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants: VariantDto[];
}
