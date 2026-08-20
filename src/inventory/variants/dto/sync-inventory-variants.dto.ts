import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ArrayMinSize,
} from 'class-validator';

export class InventoryVariantSyncInput {
  @IsOptional()
  @IsInt()
  id?: number;

  @IsString()
  color: string;

  @IsOptional()
  @IsString()
  size?: string;

  // Decimal para soportar venta por peso (kg).
  @IsNumber()
  @Min(0)
  stock: number;
}

export class SyncInventoryVariantsDto {
  @IsArray()
  @ArrayMinSize(1)
  variants: InventoryVariantSyncInput[];
}
