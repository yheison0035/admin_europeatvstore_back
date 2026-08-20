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

  @IsOptional()
  @IsString()
  size?: string;

  // Stock: entero por unidad o decimal (kg) para venta por peso.
  @IsNumber()
  @Min(0)
  stock: number;
}

export class UpdateInventoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  purchasePrice?: number;

  @IsOptional()
  @IsNumber()
  oldPrice?: number;

  @IsOptional()
  @IsNumber()
  salePrice?: number;

  @IsOptional()
  @IsInt()
  minStock?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  lot?: string;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeatureDto)
  features?: FeatureDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpecificationDto)
  specifications?: SpecificationDto[];
}

class FeatureDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsNumber()
  order?: number;
}

class SpecificationDto {
  @IsString()
  key: string;

  @IsString()
  value: string;

  @IsOptional()
  @IsNumber()
  order?: number;
}
