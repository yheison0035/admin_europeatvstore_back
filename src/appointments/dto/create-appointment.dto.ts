import { IsInt, IsOptional, IsDateString, IsString } from 'class-validator';

export class CreateAppointmentDto {
  @IsDateString()
  date: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsInt()
  serviceId: number;

  @IsInt()
  barberId: number;

  @IsOptional()
  @IsInt()
  customerId?: number;

  @IsInt()
  localId: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
