import { IsNumber, IsString } from 'class-validator';

export class CreateSignatureDto {
  @IsString()
  reference: string;

  @IsNumber()
  amountInCents: number;

  @IsString()
  currency: string;
}
