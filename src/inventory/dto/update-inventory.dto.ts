import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Status } from '@prisma/client';

class UpdateVariantDto {
  @IsOptional()
  @IsInt()
  id?: number;

  @IsString()
  color: string;

  @IsInt()
  @Min(1)
  stock: number;
}

export class UpdateInventoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  purchasePrice?: number;

  @IsOptional()
  @IsNumber()
  salePrice?: number;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateVariantDto)
  variants?: UpdateVariantDto[];
}
