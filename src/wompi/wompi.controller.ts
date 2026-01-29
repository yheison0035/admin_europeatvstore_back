import { Body, Controller, Post } from '@nestjs/common';
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
}
