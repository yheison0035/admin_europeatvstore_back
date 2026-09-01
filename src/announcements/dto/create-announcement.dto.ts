import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  IsDateString,
} from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @MaxLength(120)
  title: string;

  @IsString()
  @MaxLength(2000)
  body: string;

  @IsOptional()
  @IsIn(['INFO', 'SUCCESS', 'WARNING', 'CRITICAL'])
  level?: string;

  @IsOptional()
  @IsIn(['ALL', 'TYPE', 'PLAN'])
  audience?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  types?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  plans?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ctaLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  ctaUrl?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
