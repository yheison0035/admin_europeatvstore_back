import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsEnum,
  IsDateString,
  IsInt,
} from 'class-validator';
import { Role, Status } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsDateString()
  birthdate?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  // 🔑 Estado
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsOptional()
  @IsInt()
  localId?: number;
}
