import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsEmail,
  IsBoolean,
  MinLength,
} from 'class-validator';
import { Status } from '@prisma/client';

export class CreateCompanyDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsBoolean()
  websiteEnabled?: boolean;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  manager?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsDateString()
  paidUntil?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  // Credenciales del usuario administrador inicial de la empresa (para que
  // pueda loguear y de ahí en adelante gestione todo por su cuenta).
  @IsOptional()
  @IsString()
  adminName?: string;

  @IsOptional()
  @IsEmail()
  adminEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  adminPassword?: string;
}
