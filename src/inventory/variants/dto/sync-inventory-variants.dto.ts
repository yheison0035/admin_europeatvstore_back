import {
  IsArray,
  IsInt,
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

  @IsInt()
  @Min(0)
  stock: number;
}

export class SyncInventoryVariantsDto {
  @IsArray()
  @ArrayMinSize(1)
  variants: InventoryVariantSyncInput[];
}
