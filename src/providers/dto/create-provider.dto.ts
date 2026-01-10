import { IsOptional, IsString, IsEmail, IsEnum } from 'class-validator';
import { Status } from '@prisma/client';

export class CreateProviderDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  productType?: string;

  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}
