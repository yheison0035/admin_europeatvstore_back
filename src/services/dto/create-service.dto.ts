import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';

export class CreateServiceDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  price: number;

  @IsNumber()
  duration: number;

  @IsArray()
  @IsOptional()
  barberIds?: number[];

  @IsArray()
  @IsOptional()
  localIds?: number[];
}
