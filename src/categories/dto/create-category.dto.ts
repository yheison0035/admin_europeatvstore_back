import { IsOptional, IsString, IsEnum } from 'class-validator';
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
}
