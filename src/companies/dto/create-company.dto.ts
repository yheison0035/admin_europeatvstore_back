import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { BusinessType, Status } from '@prisma/client';

export class CreateCompanyDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  manager?: string;

  @IsOptional()
  @IsEnum(BusinessType)
  type?: BusinessType;

  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsDateString()
  paidUntil?: string;
}
