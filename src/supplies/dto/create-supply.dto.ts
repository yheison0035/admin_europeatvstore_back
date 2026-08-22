import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateSupplyDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  unit?: string; // UNIDAD | KG | GRAMO | LITRO | ML

  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsInt()
  providerId?: number;

  @IsInt()
  localId: number;
}
