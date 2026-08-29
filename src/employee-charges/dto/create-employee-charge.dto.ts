import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { EmployeeChargeType } from '@prisma/client';

export class CreateEmployeeChargeDto {
  @IsInt()
  userId: number; // empleado/barbero que debe

  @IsOptional()
  @IsEnum(EmployeeChargeType)
  type?: EmployeeChargeType;

  @IsString()
  concept: string;

  @IsNumber()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  saleId?: number;
}
