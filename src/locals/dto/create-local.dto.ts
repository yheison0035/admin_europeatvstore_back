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

  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}
