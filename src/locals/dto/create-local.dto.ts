import { IsOptional, IsString, IsInt, IsEnum } from 'class-validator';
import { Status } from '@prisma/client';

export class CreateLocalDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsInt()
  managerId?: number;

  // Solo lo usa el SUPER_PLATFORM_ADMIN para crear un local en una empresa
  // concreta. Los usuarios normales ignoran este campo (usan su companyId).
  @IsOptional()
  @IsInt()
  companyId?: number;

  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}
