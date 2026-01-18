import { IsOptional, IsString } from 'class-validator';
import { Status } from '@prisma/client';

export class CreateCustomerDto {
  @IsOptional()
  @IsString()
  type_document?: string;

  @IsOptional()
  @IsString()
  document?: string;

  @IsString()
  name: string;

  @IsOptional()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  status?: Status;

  @IsOptional()
  localId?: number;
}
