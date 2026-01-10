import { IsArray, IsInt, IsString, Min, ArrayMinSize } from 'class-validator';

class InventoryVariantInput {
  @IsString()
  color: string;

  @IsInt()
  @Min(1)
  stock: number;
}

export class AddInventoryVariantsDto {
  @IsArray()
  @ArrayMinSize(1)
  variants: InventoryVariantInput[];
}
