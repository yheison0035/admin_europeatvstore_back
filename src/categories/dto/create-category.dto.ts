import { IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';
import { Status } from '@prisma/client';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsOptional()
  localId?: number;

  // ¿Los productos de esta categoría generan comisión al empleado?
  @IsOptional()
  @IsBoolean()
  earnsCommission?: boolean;
}
