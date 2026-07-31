import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { BusinessType, Status } from '@prisma/client';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

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

  // Fecha (ISO) hasta la que la empresa está al día. null/'' para quitarla.
  @IsOptional()
  @IsDateString()
  paidUntil?: string;

  // Fecha (ISO) en que la empresa empezó con nosotros.
  @IsOptional()
  @IsDateString()
  startDate?: string;
}
