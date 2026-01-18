import { IsDateString, IsInt } from 'class-validator';

export class DailySalesReportDto {
  @IsDateString()
  date: string;

  @IsInt()
  localId: number;
}
