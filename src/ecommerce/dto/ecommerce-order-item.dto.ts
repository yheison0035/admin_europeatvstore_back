import { IsInt, IsNumber, Min } from 'class-validator';

export class EcommerceOrderItemDto {
  @IsInt()
  inventoryVariantId: number;

  @IsInt()
  @Min(1)
  quantity: number;
}
