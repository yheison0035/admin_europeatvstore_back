import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
} from 'class-validator';
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
  @IsEmail()
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
  @IsDateString()
  birthday?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  status?: Status;

  @IsOptional()
  localId?: number;

  // Segmento/etiqueta del cliente (catálogo administrable).
  @IsOptional()
  segmentId?: number;
}
