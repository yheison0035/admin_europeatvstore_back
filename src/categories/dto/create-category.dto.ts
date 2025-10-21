import { IsOptional, IsString } from 'class-validator';
import { Status } from '@prisma/client';

export class CreateCategoryDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() status?: Status;
}
