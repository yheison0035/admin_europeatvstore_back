import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '@/prisma.service';
import { WompiService } from '@/wompi/wompi.service';

// Precios COP/mes por plan. Debe coincidir con el front (src/lib/plans.js).
const PLAN_PRICES: Record<string, number> = {
  DESPEGUE: 0,
  IMPULSO: 39900,
  ALTURA: 89900,
  ORBITA: 179900,
};

@Injectable()
export class SubscriptionService {
  constructor(
    private prisma: PrismaService,
    private wompi: WompiService,
  ) {}

  // Inicia el pago de un plan con Wompi Web Checkout. Crea el registro de pago
  // (PENDING) y devuelve la URL de checkout ya firmada. El webhook de Wompi
  // confirma el pago y activa el plan.
  async startCheckout(user: any, plan: string) {
    if (!user?.companyId) {
      throw new BadRequestException('Tu usuario no tiene empresa asociada.');
    }
    const amount = PLAN_PRICES[plan];
    if (amount === undefined) {
      throw new BadRequestException('Plan no válido.');
    }
    if (amount <= 0) {
      throw new BadRequestException('El plan Despegue es gratuito.');
    }

    const publicKey = process.env.WOMPI_PUBLIC_KEY;
    const integrity = process.env.WOMPI_INTEGRITY_SECRET;
    if (!publicKey || !integrity) {
      // Aún no hay pasarela configurada: mensaje claro para el cliente.
      throw new ServiceUnavailableException(
        'Los pagos en línea todavía no están activos. Escríbenos para activar tu plan.',
      );
    }

    const amountInCents = amount * 100;
    const currency = 'COP';
    const reference = `SUB-${user.companyId}-${Date.now()}-${randomBytes(4).toString('hex')}`;

    await this.prisma.subscriptionPayment.create({
      data: { companyId: user.companyId, plan, amount, reference, status: 'PENDING' },
    });

    const { signature } = this.wompi.generateSignature({
      reference,
      amountInCents,
      currency,
    });

    const base = process.env.FRONTEND_URL || 'https://pegazo.co';
    const redirectUrl = `${base}/dashboard/upgrade?ref=${encodeURIComponent(reference)}`;

    const params = new URLSearchParams({
      'public-key': publicKey,
      currency,
      'amount-in-cents': String(amountInCents),
      reference,
      'signature:integrity': signature,
      'redirect-url': redirectUrl,
    });
    const checkoutUrl = `https://checkout.wompi.co/p/?${params.toString()}`;

    return {
      success: true,
      data: {
        checkoutUrl,
        reference,
        plan,
        amount,
        amountInCents,
        currency,
      },
    };
  }

  // Estado de un pago (para la pantalla de retorno tras el checkout). Si sigue
  // pendiente, intenta reconciliar consultando la transacción en Wompi.
  async status(user: any, reference: string) {
    const pay = await this.prisma.subscriptionPayment.findUnique({
      where: { reference },
    });
    if (!pay || pay.companyId !== user.companyId) {
      throw new NotFoundException('Pago no encontrado.');
    }
    return {
      success: true,
      data: {
        reference: pay.reference,
        plan: pay.plan,
        amount: pay.amount,
        status: pay.status,
      },
    };
  }
}
