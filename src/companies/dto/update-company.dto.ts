import {
  IsBoolean,
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsArray,
  IsInt,
  Min,
} from 'class-validator';
import { Status } from '@prisma/client';

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
  @IsString()
  type?: string;

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

  // Dominio de su tienda online. Se normaliza y valida que no lo tenga otra.
  @IsOptional()
  @IsString()
  domain?: string;

  // Publica o retira la tienda de ese dominio.
  @IsOptional()
  @IsBoolean()
  websiteEnabled?: boolean;

  // Control MANUAL de módulos habilitados por empresa (superplatform).
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledModules?: string[];

  // Funciones que la PLATAFORMA activa por empresa.
  @IsOptional()
  @IsBoolean()
  bankNotifyEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  electronicInvoicingEnabled?: boolean;

  // Empresa de PRUEBAS (sandbox): ve funciones aún no liberadas al 100% (DIAN).
  @IsOptional()
  @IsBoolean()
  isTestCompany?: boolean;

  @IsOptional()
  @IsString()
  crmTheme?: string;

  @IsOptional()
  @IsString()
  crmFont?: string;

  // Día de inicio del ciclo de cierre mensual (1–28). 1 = mes calendario.
  @IsOptional()
  @IsInt()
  @Min(1)
  cycleStartDay?: number;

  // Precio acordado (COP/mes) y descuento inicial por tiempo.
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyPrice?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountedPrice?: number | null;

  @IsOptional()
  @IsDateString()
  discountUntil?: string;
}
