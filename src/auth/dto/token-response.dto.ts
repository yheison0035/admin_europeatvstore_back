import { ApiProperty } from '@nestjs/swagger';

export class TokenResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  access_token: string;

  @ApiProperty({ example: 1 })
  userId: number;

  @ApiProperty({ example: 'SUPER_ADMIN' })
  role: string;

  @ApiProperty({ example: 'yheison0035@gmail.com' })
  email: string;

  @ApiProperty({ example: 'Yeison Suarez' })
  name: string;
}
