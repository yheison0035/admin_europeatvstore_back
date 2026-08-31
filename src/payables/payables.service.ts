import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Role } from '@prisma/client';
import { PrismaService } from '@/prisma.service';
import { ExpensesService } from '@/expenses/expenses.service';
import { PushService } from '@/push/push.service';
import { CreatePayableDto } from './dto/create-payable.dto';

const MANAGE_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.RECEPCIONISTA,
];

// Colombia = UTC-5.
const COLOMBIA_OFFSET_MIN = 300;

@Injectable()
export class PayablesService {
  constructor(
    private prisma: PrismaService,
    private expenses: ExpensesService,
    private push: PushService,
  ) {}

  // Medianoche de hoy en Colombia, expresada en UTC.
  static colombiaTodayMidnightUtc(): Date {
    const col = new Date(Date.now() - COLOMBIA_OFFSET_MIN * 60000);
    return new Date(
      Date.UTC(col.getUTCFullYear(), col.getUTCMonth(), col.getUTCDate()),
    );
  }

  private assertManage(user: any) {
    if (!MANAGE_ROLES.includes(user.role)) {
      throw new ForbiddenException('No tienes permisos');
    }
  }

  async findAllPaginated(user: any, query: any = {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = { companyId: user.companyId };
    if (query.status) where.status = String(query.status).toUpperCase();
    if (query.concept) {
      where.concept = { contains: query.concept, mode: 'insensitive' };
    }
    if (query.paidTo) {
      where.paidTo = { contains: query.paidTo, mode: 'insensitive' };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.payable.findMany({
        where,
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.payable.count({ where }),
    ]);

    return {
      success: true,
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // Resumen para las tarjetas: por pagar, vencido y pagado (del periodo actual).
  async summary(user: any) {
    const pend = await this.prisma.payable.findMany({
      where: { companyId: user.companyId, status: 'PENDIENTE' },
      select: { amount: true, dueDate: true },
    });
    const today = PayablesService.colombiaTodayMidnightUtc();
    const soonLimit = new Date(today.getTime() + 3 * 86400000); // hoy + 3 días
    const pending = pend.reduce((s, p) => s + p.amount, 0);
    const overduePs = pend.filter(
      (p) => p.dueDate && new Date(p.dueDate) < today,
    );
    // "Vence pronto": vence entre hoy y los próximos 3 días (sin incluir vencidos).
    const soonPs = pend.filter(
      (p) =>
        p.dueDate &&
        new Date(p.dueDate) >= today &&
        new Date(p.dueDate) < soonLimit,
    );
    const sum = (arr: { amount: number }[]) =>
      arr.reduce((s, p) => s + p.amount, 0);
    return {
      success: true,
      data: {
        pending,
        overdue: sum(overduePs),
        overdueCount: overduePs.length,
        dueSoon: sum(soonPs),
        dueSoonCount: soonPs.length,
        count: pend.length,
      },
    };
  }

  async create(dto: CreatePayableDto, user: any) {
    this.assertManage(user);
    const local = await this.prisma.local.findFirst({
      where: { id: Number(dto.localId), companyId: user.companyId },
      select: { id: true },
    });
    if (!local) throw new BadRequestException('Local no válido');

    const payable = await this.prisma.payable.create({
      data: {
        companyId: user.companyId,
        localId: Number(dto.localId),
        concept: dto.concept,
        paidTo: dto.paidTo ?? null,
        type: dto.type ?? 'OTROS',
        amount: Number(dto.amount),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        notes: dto.notes ?? null,
        createdById: user.id,
        createdByName: user.name ?? null,
      },
    });
    return { success: true, data: payable };
  }

  private async own(id: number, user: any) {
    const p = await this.prisma.payable.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!p) throw new NotFoundException('Cuenta por pagar no encontrada');
    return p;
  }

  async update(id: number, dto: any, user: any) {
    this.assertManage(user);
    const p = await this.own(id, user);
    if (p.status === 'PAGADO') {
      throw new BadRequestException('Ya está pagada; no se puede editar');
    }
    const updated = await this.prisma.payable.update({
      where: { id },
      data: {
        ...(dto.concept !== undefined && { concept: dto.concept }),
        ...(dto.paidTo !== undefined && { paidTo: dto.paidTo || null }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.amount !== undefined && { amount: Number(dto.amount) }),
        ...(dto.dueDate !== undefined && {
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes || null }),
        ...(dto.localId !== undefined && { localId: Number(dto.localId) }),
      },
    });
    return { success: true, data: updated };
  }

  // Registrar el pago: genera un GASTO con la fecha del pago y marca PAGADO.
  async pay(id: number, dto: any, user: any) {
    this.assertManage(user);
    const p = await this.own(id, user);
    if (p.status === 'PAGADO') {
      throw new BadRequestException('Esta cuenta ya está pagada');
    }
    const paidAt = dto?.paidAt ? new Date(dto.paidAt) : new Date();
    const paymentMethod = dto?.paymentMethod || 'EFECTIVO';

    // Se genera el gasto reutilizando el servicio de gastos (integra la caja).
    const exp = await this.expenses.create(
      {
        localId: p.localId,
        concept: p.concept,
        type: p.type,
        amount: p.amount,
        paymentMethod,
        paidTo: p.paidTo ?? undefined,
        notes: p.notes ?? undefined,
        expenseDate: paidAt.toISOString(),
      } as any,
      user,
    );
    const expenseId = (exp?.data as any)?.id ?? null;

    const updated = await this.prisma.payable.update({
      where: { id },
      data: {
        status: 'PAGADO',
        paidAt,
        paymentMethod,
        expenseId,
      },
    });
    return { success: true, data: updated };
  }

  // Deshacer el pago: borra el gasto generado y vuelve a PENDIENTE.
  async unpay(id: number, user: any) {
    this.assertManage(user);
    const p = await this.own(id, user);
    if (p.status !== 'PAGADO') {
      throw new BadRequestException('Esta cuenta no está pagada');
    }
    if (p.expenseId) {
      await this.prisma.expense
        .delete({ where: { id: p.expenseId } })
        .catch(() => null);
    }
    const updated = await this.prisma.payable.update({
      where: { id },
      data: {
        status: 'PENDIENTE',
        paidAt: null,
        paymentMethod: null,
        expenseId: null,
      },
    });
    return { success: true, data: updated };
  }

  async remove(id: number, user: any) {
    this.assertManage(user);
    const p = await this.own(id, user);
    // Si estaba pagada, se elimina también el gasto generado.
    if (p.expenseId) {
      await this.prisma.expense
        .delete({ where: { id: p.expenseId } })
        .catch(() => null);
    }
    await this.prisma.payable.delete({ where: { id } });
    return { success: true };
  }

  // Aviso diario 9:00 a. m. Colombia (14:00 UTC): notifica al dueño/admin/
  // recepción las cuentas vencidas o que vencen en los próximos 3 días.
  @Cron('0 14 * * *')
  async notifyDuePayables() {
    try {
      const today = PayablesService.colombiaTodayMidnightUtc();
      const soonLimit = new Date(today.getTime() + 3 * 86400000);

      const pend = await this.prisma.payable.findMany({
        where: {
          status: 'PENDIENTE',
          dueDate: { not: null, lt: soonLimit },
        },
        select: { companyId: true, amount: true, dueDate: true },
      });
      if (!pend.length) return;

      // Agrupa por empresa.
      const byCompany = new Map<
        number,
        { overdue: number; soon: number; overdueAmt: number; soonAmt: number }
      >();
      for (const p of pend) {
        const g =
          byCompany.get(p.companyId) ??
          { overdue: 0, soon: 0, overdueAmt: 0, soonAmt: 0 };
        if (p.dueDate && new Date(p.dueDate) < today) {
          g.overdue += 1;
          g.overdueAmt += p.amount;
        } else {
          g.soon += 1;
          g.soonAmt += p.amount;
        }
        byCompany.set(p.companyId, g);
      }

      const fmt = (n: number) =>
        '$' + Math.round(n).toLocaleString('es-CO');

      for (const [companyId, g] of byCompany) {
        const parts: string[] = [];
        if (g.overdue) {
          parts.push(
            `${g.overdue} vencida${g.overdue > 1 ? 's' : ''} (${fmt(g.overdueAmt)})`,
          );
        }
        if (g.soon) {
          parts.push(
            `${g.soon} por vencer (${fmt(g.soonAmt)})`,
          );
        }
        await this.push
          .sendToCompanyRoles(
            companyId,
            ['SUPER_ADMIN', 'ADMIN', 'RECEPCIONISTA'],
            {
              title: 'Cuentas por pagar',
              body: `Tienes ${parts.join(' y ')}.`,
              url: '/dashboard/payables',
              tag: 'payables-due',
            },
          )
          .catch(() => null);
      }
    } catch {
      // Silencioso: el cron nunca debe tumbar la app.
    }
  }
}
