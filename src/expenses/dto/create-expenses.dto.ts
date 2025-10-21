import { IsNumber, IsOptional, IsString } from 'class-validator';
import { PaymentMethod, Status } from '@prisma/client';

export class CreateExpenseDto {
  @IsString() concept: string;
  @IsOptional() @IsString() category?: string;
  @IsNumber() amount: number;
  @IsOptional() paymentMethod?: PaymentMethod;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() status?: Status;
  @IsOptional() expenseDate?: string;
  @IsOptional() @IsNumber() providerId?: number;
  @IsOptional() @IsNumber() localId?: number;
}
