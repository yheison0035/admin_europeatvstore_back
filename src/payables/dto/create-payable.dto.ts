import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ExpenseType } from '@prisma/client';

export class CreatePayableDto {
  @IsInt()
  localId: number;

  @IsString()
  concept: string;

  @IsOptional()
  @IsString()
  paidTo?: string;

  @IsOptional()
  @IsEnum(ExpenseType)
  type?: ExpenseType;

  @IsNumber()
  @Min(1)
  amount: number;

  // Cuándo se debe pagar (vencimiento).
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
