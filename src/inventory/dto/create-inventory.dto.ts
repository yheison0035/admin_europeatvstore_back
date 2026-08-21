import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Status } from '@prisma/client';

class VariantDto {
  @IsString()
  color: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsNumber()
  stock: number;
}

export class CreateInventoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  barcode?: string;

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
  @IsNumber()
  minStock?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  // ¿Controla inventario/stock? (false = elaborado sin stock, ej. platos).
  @IsOptional()
  @IsBoolean()
  trackStock?: boolean;

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants: VariantDto[];

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
