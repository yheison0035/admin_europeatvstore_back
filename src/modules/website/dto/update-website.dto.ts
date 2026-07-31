import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Todo lo que una empresa puede configurar de su tienda online desde el CRM.
 * Nada de esto es obligatorio: la tienda funciona con lo que haya y usa
 * valores por defecto para el resto.
 */
export class UpdateWebsiteDto {
  /* ---------- Identidad / diseño (Company) ---------- */

  @IsOptional()
  @IsString()
  @MaxLength(120)
  websiteName?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  favicon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  theme?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  fontFamily?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  accentColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  ctaColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  heroTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  heroSubtitle?: string;

  /* ---------- Contacto / redes / SEO (WebsiteSetting) ---------- */

  @IsOptional()
  @IsString()
  facebook?: string;

  @IsOptional()
  @IsString()
  instagram?: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsOptional()
  @IsString()
  youtube?: string;

  @IsOptional()
  @IsString()
  tiktok?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  schedule?: string;

  @IsOptional()
  @IsString()
  footerText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(70)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  metaDescription?: string;

  /** Local (sede) cuyo inventario se publica en la tienda. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ecommerceLocalId?: number;

  /* ---------- Infraestructura (solo plataforma) ---------- */

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsBoolean()
  websiteEnabled?: boolean;
}
