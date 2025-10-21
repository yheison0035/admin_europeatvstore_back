import { IsOptional, IsString, IsEmail } from 'class-validator';
import { Status } from '@prisma/client';

export class CreateProviderDto {
  @IsString() name: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() productType?: string;
  @IsOptional() status?: Status;
}
