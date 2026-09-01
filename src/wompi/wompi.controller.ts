import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from '@/auth/decorators/public.decorator';
import { WompiService } from './wompi.service';
import { CreateSignatureDto } from './dto/create-signature.dto';
import { PrismaService } from '@/prisma.service';
import { WebsiteGuard } from '@/common/guards/website.guard';
import { Website } from '@/common/decorators/website.decorator';
import { WebsiteContext } from '@/modules/website/interfaces/website-context.interface';

@Controller('wompi')
export class WompiController {
  constructor(
    private readonly wompiService: WompiService,
    private readonly prisma: PrismaService,
  ) {}

  // Firma de integridad para el checkout de la TIENDA. Usa el secreto de la
  // empresa dueña del dominio (WebsiteGuard resuelve la empresa por el host).
  @Public()
  @UseGuards(WebsiteGuard)
  @Post('signature')
  async createSignature(
    @Body() dto: CreateSignatureDto,
    @Website() website: WebsiteContext,
  ) {
    const company: any = await this.prisma.company.findUnique({
      where: { id: website.companyId },
      omit: { wompiIntegritySecret: false },
    });
    if (!company?.wompiEnabled || !company?.wompiIntegritySecret) {
      throw new BadRequestException(
        'Esta tienda no tiene pagos en línea configurados.',
      );
    }
    return this.wompiService.generateSignature({
      ...dto,
      integritySecret: company.wompiIntegritySecret,
    });
  }

  @Public()
  @Get('transaction/:id')
  async getTransaction(@Param('id') id: string) {
    return this.wompiService.getTransaction(id);
  }

  // Webhook de confirmación de pago que Wompi llama directamente. La firma se
  // verifica con el secreto de eventos que corresponda: el de la empresa (venta
  // de tienda) o el global de Pegazo (suscripción SUB-*).
  @Public()
  @Post('webhook')
  async webhook(@Body() event: any) {
    const tx = event?.data?.transaction;
    const reference = tx?.reference;
    const status = tx?.status; // APPROVED | DECLINED | VOIDED | ERROR

    if (!reference || !status) {
      return { received: true, valid: false };
    }

    // Pago de SUSCRIPCIÓN de Pegazo: secreto de eventos global.
    if (reference.startsWith('SUB-')) {
      if (!this.wompiService.verifyEventChecksum(event)) {
        return { received: true, valid: false };
      }
      await this.applySubscription(reference, status, tx?.id);
      return { received: true, valid: true };
    }

    // Pago de una VENTA de la tienda: ubicar la empresa por la venta y verificar
    // con SU secreto de eventos.
    const sale = await this.prisma.sale.findFirst({
      where: { wompiReference: reference },
      select: { id: true, local: { select: { companyId: true } } },
    });
    if (!sale) {
      return { received: true, valid: false };
    }
    const company: any = await this.prisma.company.findUnique({
      where: { id: sale.local.companyId },
      omit: { wompiEventsSecret: false },
    });
    if (
      !this.wompiService.verifyEventChecksum(
        event,
        company?.wompiEventsSecret || undefined,
      )
    ) {
      return { received: true, valid: false };
    }

    await this.prisma.sale.update({
      where: { id: sale.id },
      data: {
        wompiStatus: status,
        wompiTransactionId: tx?.id ?? undefined,
        ...(status === 'APPROVED' && { paymentStatus: 'PAGADA' as any }),
      },
    });

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
