import { IsString, IsNotEmpty, MinLength, Length } from 'class-validator';

export class ResetOtpDto {
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @IsString()
  @Length(6, 6)
  code: string;

  @IsString()
  @MinLength(6)
  password: string;
}
