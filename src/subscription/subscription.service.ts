import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';

const PLAN_IDS = ['DESPEGUE', 'IMPULSO', 'ALTURA', 'ORBITA'];

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  // Inicia la mejora/compra de un plan. Estructura lista para Wompi: aquí se
  // creará el link/transacción de pago y se devolverá { checkoutUrl }. Al
  // confirmar el pago (webhook de Wompi) se actualizará Company.plan y paidUntil.
  async startCheckout(user: any, plan: string) {
    if (!PLAN_IDS.includes(plan)) {
      throw new BadRequestException('Plan no válido.');
    }

    // TODO(Wompi): generar la transacción/link de suscripción para `plan`
    // asociada a user.companyId y devolver { checkoutUrl }.
    return {
      success: true,
      message:
        'Solicitud de plan registrada. El pago en línea con Wompi se activará pronto; te contactaremos para completar la activación.',
      data: { checkoutUrl: null, plan },
    };
  }
}
