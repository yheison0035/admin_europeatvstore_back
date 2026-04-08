import { IsNumber, IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateAppointmentDto {
  @IsDateString()
  date: string;

  @IsDateString()
  startTime: string;

  @IsNumber()
  serviceId: number;

  @IsNumber()
  barberId: number;

  @IsNumber()
  localId: number;

  @IsOptional()
  @IsNumber()
  customerId?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
