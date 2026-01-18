import { IsDateString, IsInt } from 'class-validator';

export class RangeSalesReportDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsInt()
  localId: number;

  @IsInt()
  userId: number;
}
