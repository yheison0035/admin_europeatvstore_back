import { IsOptional, IsString } from 'class-validator';

export class DashboardDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  localId?: string;
}
