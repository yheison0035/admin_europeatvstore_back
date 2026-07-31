import { IsOptional, IsString, IsBoolean, IsInt, IsNumber } from 'class-validator';

// Configuración fiscal de una empresa (la edita su SUPER_ADMIN o la plataforma).
export class CompanyConfigDto {
  // Solo lo usa la plataforma para editar la config de una empresa concreta.
  @IsOptional()
  @IsInt()
  companyId?: number;

  @IsOptional()
  @IsBoolean()
  responsableIVA?: boolean;

  @IsOptional()
  @IsBoolean()
  preciosIncluyenIVA?: boolean;

  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  nit?: string;

  @IsOptional()
  @IsString()
  dv?: string;

  @IsOptional()
  @IsString()
  personType?: string;

  @IsOptional()
  @IsString()
  taxRegime?: string;

  @IsOptional()
  @IsString()
  ciiu?: string;

  @IsOptional()
  @IsString()
  fiscalAddress?: string;

  @IsOptional()
  @IsString()
  fiscalCity?: string;

  @IsOptional()
  @IsNumber()
  defaultTaxRate?: number;
}
