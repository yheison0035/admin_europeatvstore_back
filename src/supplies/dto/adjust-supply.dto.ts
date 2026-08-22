import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AdjustSupplyDto {
  // ENTRADA suma, SALIDA resta, AJUSTE fija el stock a la cantidad dada.
  @IsIn(['ENTRADA', 'SALIDA', 'AJUSTE'])
  type: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
