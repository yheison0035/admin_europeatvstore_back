import { IsOptional, IsString, IsEnum, IsInt } from 'class-validator';
import { Status } from '@prisma/client';

export class UpdateLocalDto {
  @IsOptional()
  @IsString()
  name?: string;

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
  @IsEnum(Status)
  status?: Status;

  @IsOptional()
  @IsInt()
  managerId?: number;
}
