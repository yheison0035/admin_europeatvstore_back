import { IsString, IsNotEmpty } from 'class-validator';

export class ForgotOtpDto {
  // Correo o número de celular con el que se identifica la cuenta.
  @IsString()
  @IsNotEmpty()
  identifier: string;
}
