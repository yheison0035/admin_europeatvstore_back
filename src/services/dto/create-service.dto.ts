import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Status } from '@prisma/client';

class ServiceLocalDto {
  @IsInt()
  localId: number;

  @IsNumber()
  price: number;
}

export class CreateServiceDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  duration: number;

  @IsOptional()
  status?: Status;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ServiceLocalDto)
  locals: ServiceLocalDto[];

  @IsOptional()
  @IsArray()
  barberIds?: number[];
}
