import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Public } from 'src/auth/decorators/public.decorator';
import { WompiService } from './wompi.service';
import { CreateSignatureDto } from './dto/create-signature.dto';

@Controller('wompi')
export class WompiController {
  constructor(private readonly wompiService: WompiService) {}

  @Public()
  @Post('signature')
  createSignature(@Body() dto: CreateSignatureDto) {
    return this.wompiService.generateSignature(dto);
  }

  @Public()
  @Get('transaction/:id')
  async getTransaction(@Param('id') id: string) {
    return this.wompiService.getTransaction(id);
  }
}
