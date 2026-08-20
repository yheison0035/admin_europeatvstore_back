import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Public } from '@/auth/decorators/public.decorator';
import { WompiService } from './wompi.service';
import { CreateSignatureDto } from './dto/create-signature.dto';
import { PrismaService } from '@/prisma.service';

@Controller('wompi')
export class WompiController {
  constructor(
    private readonly wompiService: WompiService,
    private readonly prisma: PrismaService,
  ) {}

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

  // Webhook de confirmación de pago que Wompi llama directamente. Verifica la
  // firma y actualiza la venta correspondiente por su referencia.
  @Public()
  @Post('webhook')
  async webhook(@Body() event: any) {
    if (!this.wompiService.verifyEventChecksum(event)) {
      return { received: true, valid: false };
    }

    const tx = event?.data?.transaction;
    const reference = tx?.reference;
    const status = tx?.status; // APPROVED | DECLINED | VOIDED | ERROR

    if (reference && status) {
      const sale = await this.prisma.sale.findFirst({
        where: { wompiReference: reference },
        select: { id: true },
      });
      if (sale) {
        await this.prisma.sale.update({
          where: { id: sale.id },
          data: {
            wompiStatus: status,
            wompiTransactionId: tx?.id ?? undefined,
            ...(status === 'APPROVED' && { paymentStatus: 'PAGADA' as any }),
          },
        });
      }
    }

    return { received: true, valid: true };
  }
}
