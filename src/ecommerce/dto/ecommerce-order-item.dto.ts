import { IsInt, IsNumber, Min } from 'class-validator';

export class EcommerceOrderItemDto {
  @IsInt()
  inventoryVariantId: number;

  // Número (no entero) para admitir venta por peso (ej. 1.5 kg).
  @IsNumber()
  @Min(0.01)
  quantity: number;
}
