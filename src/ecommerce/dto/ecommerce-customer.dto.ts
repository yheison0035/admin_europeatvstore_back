import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class EcommerceCustomerDto {
  @IsEmail()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  // Dirección: obligatoria solo en entregas a domicilio. En "recoger en tienda"
  // o "mesa" no aplica, por eso son opcionales (el frontend valida por modo).
  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  addressDetail?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @IsBoolean()
  isHardToAccess?: boolean;

  @IsOptional()
  @IsBoolean()
  billingSameAsShipping?: boolean;

  @IsOptional()
  @IsString()
  billingFirstName?: string;

  @IsOptional()
  @IsString()
  billingLastName?: string;

  @IsOptional()
  @IsString()
  billingPhone?: string;

  @IsOptional()
  @IsString()
  billingAddress?: string;
}
