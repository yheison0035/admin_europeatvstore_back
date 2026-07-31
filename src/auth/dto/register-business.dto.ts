import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { BusinessType } from '@prisma/client';

export const PLAN_IDS = ['DESPEGUE', 'IMPULSO', 'ALTURA', 'ORBITA'] as const;

// Auto-registro público: el cliente crea su empresa y su usuario administrador
// en un solo paso, y queda listo para trabajar (plan gratuito por defecto).
export class RegisterBusinessDto {
  @IsString()
  @MinLength(2)
  companyName: string;

  @IsOptional()
  @IsEnum(BusinessType)
  type?: BusinessType;

  @IsString()
  @MinLength(2)
  ownerName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  // Plan obligatorio: el cliente debe elegir uno para continuar.
  @IsIn(PLAN_IDS as unknown as string[])
  plan: string;

  // Cupón de descuento opcional.
  @IsOptional()
  @IsString()
  couponCode?: string;
}
