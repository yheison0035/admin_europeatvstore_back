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

  @IsString()
  department: string;

  @IsString()
  city: string;

  @IsString()
  address: string;

  @IsOptional()
  @IsString()
  addressDetail?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsBoolean()
  isHardToAccess: boolean;

  @IsBoolean()
  billingSameAsShipping: boolean;

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
