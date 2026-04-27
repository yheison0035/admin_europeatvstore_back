import { AppointmentStatus, SaleStatus } from '@prisma/client';
import {
  IsInt,
  IsOptional,
  IsDateString,
  IsString,
  IsEnum,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsDateString()
  date: string;

  @IsString()
  startTime: string;

  @IsInt()
  serviceId: number;

  @IsInt()
  barberId: number;

  @IsInt()
  localId: number;

  @IsOptional()
  @IsInt()
  customerId?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;
}
