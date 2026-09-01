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
      // Pago de SUSCRIPCIÓN (upgrade de plan): referencia SUB-*.
      if (reference.startsWith('SUB-')) {
        await this.applySubscription(reference, status, tx?.id);
      } else {
        // Pago de una venta de la tienda.
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
    }

    return { received: true, valid: true };
  }

  // Confirma un pago de suscripción y activa el plan de la empresa. Idempotente:
  // si ya estaba APPROVED, no vuelve a sumar días.
  private async applySubscription(
    reference: string,
    status: string,
    transactionId?: string,
  ) {
    const pay = await this.prisma.subscriptionPayment.findUnique({
      where: { reference },
    });
    if (!pay || pay.status === 'APPROVED') return;

    await this.prisma.subscriptionPayment.update({
      where: { reference },
      data: { status, transactionId: transactionId ?? pay.transactionId },
    });

    if (status !== 'APPROVED') return;

    const company = await this.prisma.company.findUnique({
      where: { id: pay.companyId },
      select: { paidUntil: true },
    });
    const now = new Date();
    const from =
      company?.paidUntil && new Date(company.paidUntil) > now
        ? new Date(company.paidUntil)
        : now;
    const paidUntil = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.company.update({
      where: { id: pay.companyId },
      data: { plan: pay.plan, monthlyPrice: pay.amount, paidUntil },
    });
  }
}
