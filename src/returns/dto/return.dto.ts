import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayNotEmpty,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReturnItemDto {
  @IsInt()
  saleItemId: number;

  @IsNumber()
  @Min(0)
  quantity: number;
}

export class CreateReturnDto {
  @IsInt()
  saleId: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];
}
