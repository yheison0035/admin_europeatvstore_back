import { IsArray, IsInt, IsNumber, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class RecipeLineDto {
  @IsInt()
  supplyId: number;

  @IsNumber()
  @Min(0)
  quantity: number;
}

export class SetRecipeDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  items: RecipeLineDto[];
}
