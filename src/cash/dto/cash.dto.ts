import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsEnum,
  Min,
} from 'class-validator';
import { CashMovementType } from '@prisma/client';

export class OpenCashDto {
  @IsInt()
  localId: number;

  @IsNumber()
  @Min(0)
  openingAmount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CashMovementDto {
  @IsEnum(CashMovementType)
  type: CashMovementType;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  concept?: string;
}

export class CloseCashDto {
  @IsNumber()
  @Min(0)
  countedAmount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
