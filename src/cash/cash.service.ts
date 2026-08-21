import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { OpenCashDto, CashMovementDto, CloseCashDto } from './dto/cash.dto';

// Suma ingresos/egresos y calcula el esperado en caja.
function computeTotals(register: any) {
  const movements = register.movements || [];
  const ingresos = movements
    .filter((m: any) => m.type === 'INGRESO')
    .reduce((s: number, m: any) => s + m.amount, 0);
  const egresos = movements
    .filter((m: any) => m.type === 'EGRESO')
    .reduce((s: number, m: any) => s + m.amount, 0);
  const expected = (register.openingAmount || 0) + ingresos - egresos;
  return { ingresos, egresos, expected };
}

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertLocalInCompany(localId: number, companyId: number) {
    const local = await this.prisma.local.findFirst({
      where: { id: localId, companyId },
    });
    if (!local) throw new NotFoundException('Local no encontrado');
    return local;
  }

  // Caja abierta actual de un local (o null).
  async getCurrent(user: any, localId: number) {
    if (!localId) throw new BadRequestException('localId es obligatorio');
    await this.assertLocalInCompany(localId, user.companyId);

    const base = await this.prisma.cashRegister.findFirst({
      where: { localId, companyId: user.companyId, status: 'ABIERTA' },
    });

    if (!base) return { success: true, data: null };

    // Se auto-reconcilia con las ventas del día antes de mostrarla.
    await this.reconcileCashSales(base);

    const register = await this.prisma.cashRegister.findUnique({
      where: { id: base.id },
      include: {
        movements: { orderBy: { createdAt: 'desc' } },
        openedBy: { select: { id: true, name: true } },
        local: { select: { id: true, name: true } },
      },
    });

    return {
      success: true,
      data: { ...register, totals: computeTotals(register) },
    };
  }

  async open(user: any, dto: OpenCashDto) {
    await this.assertLocalInCompany(dto.localId, user.companyId);

    const existing = await this.prisma.cashRegister.findFirst({
      where: {
        localId: dto.localId,
        companyId: user.companyId,
        status: 'ABIERTA',
      },
    });
    if (existing) {
      throw new BadRequestException(
        'Ya hay una caja abierta en este local. Ciérrala antes de abrir otra.',
      );
    }

    const register = await this.prisma.cashRegister.create({
      data: {
        localId: dto.localId,
        companyId: user.companyId,
        openingAmount: dto.openingAmount ?? 0,
        notes: dto.notes,
        openedById: user.id,
      },
    });

    // Al abrir, importa las ventas en efectivo del día que aún no estén en
    // ninguna caja (por si vendieron antes de abrir), para que el arqueo cuadre.
    await this.reconcileCashSales(register);

    const full = await this.prisma.cashRegister.findUnique({
      where: { id: register.id },
      include: { movements: true },
    });

    return {
      success: true,
      message: 'Caja abierta',
      data: { ...full, totals: computeTotals(full) },
    };
  }

  // Inicio del día (zona Colombia UTC-5) de una fecha, expresado en UTC.
  private colombiaDayStart(date: Date): Date {
    const col = new Date(date.getTime() - 5 * 3600 * 1000);
    return new Date(
      Date.UTC(col.getUTCFullYear(), col.getUTCMonth(), col.getUTCDate(), 5, 0, 0),
    );
  }

  // AUTO-RECONCILIACIÓN: registra como ingreso las ventas en efectivo del local
  // —desde el día en que se abrió la caja— que aún no estén en ninguna caja.
  // Es idempotente (solo importa ventas sin movimiento asociado), así la caja
  // SIEMPRE cuadra con las ventas del reporte, sin importar si la venta ocurrió
  // antes de abrir, después de cerrar o durante un reinicio del servidor.
  private async reconcileCashSales(register: {
    id: number;
    localId: number;
    openedAt: Date;
    openedById: number | null;
    closedAt: Date | null;
  }) {
    const saleDate: any = {
      gte: this.colombiaDayStart(new Date(register.openedAt)),
    };
    if (register.closedAt) saleDate.lt = register.closedAt;

    const sales = await this.prisma.sale.findMany({
      where: {
        localId: register.localId,
        paymentMethod: 'EFECTIVO',
        saleStatus: { notIn: ['CANCELADA', 'RECHAZADA', 'DEVUELTA'] as any },
        saleDate,
        cashMovements: { none: {} },
      },
      select: { id: true, totalAmount: true },
    });

    for (const s of sales) {
      await this.prisma.cashMovement.create({
        data: {
          cashRegisterId: register.id,
          type: 'INGRESO',
          amount: s.totalAmount,
          concept: 'Venta en efectivo',
          saleId: s.id,
          userId: register.openedById,
        },
      });
    }
    return sales.length;
  }

  async addMovement(user: any, id: number, dto: CashMovementDto) {
    const register = await this.prisma.cashRegister.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!register) throw new NotFoundException('Caja no encontrada');
    if (register.status !== 'ABIERTA') {
      throw new BadRequestException('La caja está cerrada');
    }

    await this.prisma.cashMovement.create({
      data: {
        cashRegisterId: id,
        type: dto.type,
        amount: dto.amount,
        concept: dto.concept,
        userId: user.id,
      },
    });

    return this.findOne(user, id);
  }

  async close(user: any, id: number, dto: CloseCashDto) {
    const register = await this.prisma.cashRegister.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!register) throw new NotFoundException('Caja no encontrada');
    if (register.status !== 'ABIERTA') {
      throw new BadRequestException('La caja ya está cerrada');
    }

    // Antes del arqueo, se asegura de tener TODAS las ventas en efectivo del día.
    await this.reconcileCashSales(register);
    const fresh = await this.prisma.cashRegister.findUnique({
      where: { id },
      include: { movements: true },
    });

    const { expected } = computeTotals(fresh);
    const difference = (dto.countedAmount ?? 0) - expected;

    const updated = await this.prisma.cashRegister.update({
      where: { id },
      data: {
        status: 'CERRADA',
        closedAt: new Date(),
        closedById: user.id,
        countedAmount: dto.countedAmount,
        expectedAmount: expected,
        difference,
        notes: dto.notes ?? register.notes,
      },
      include: { movements: true },
    });

    return {
      success: true,
      message: 'Caja cerrada',
      data: { ...updated, totals: computeTotals(updated) },
    };
  }

  // Reabre una caja cerrada (por si se cerró por error). Solo si no hay otra
  // caja abierta en ese local. Limpia los datos del cierre.
  async reopen(user: any, id: number) {
    const register = await this.prisma.cashRegister.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!register) throw new NotFoundException('Caja no encontrada');
    if (register.status === 'ABIERTA') {
      throw new BadRequestException('La caja ya está abierta.');
    }
    const other = await this.prisma.cashRegister.findFirst({
      where: {
        localId: register.localId,
        companyId: user.companyId,
        status: 'ABIERTA',
      },
    });
    if (other) {
      throw new BadRequestException(
        'Ya hay otra caja abierta en este local. Ciérrala antes de reabrir esta.',
      );
    }
    const updated = await this.prisma.cashRegister.update({
      where: { id },
      data: {
        status: 'ABIERTA',
        closedAt: null,
        closedById: null,
        countedAmount: null,
        expectedAmount: null,
        difference: null,
      },
      include: { movements: true },
    });
    return {
      success: true,
      message: 'Caja reabierta',
      data: { ...updated, totals: computeTotals(updated) },
    };
  }

  async findAll(user: any, query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = { companyId: user.companyId };
    if (query.status) where.status = query.status;
    if (query.localId && /^\d+$/.test(String(query.localId))) {
      where.localId = Number(query.localId);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.cashRegister.findMany({
        where,
        skip,
        take: limit,
        orderBy: { openedAt: 'desc' },
        include: {
          openedBy: { select: { id: true, name: true } },
          closedBy: { select: { id: true, name: true } },
          local: { select: { id: true, name: true } },
          _count: { select: { movements: true } },
        },
      }),
      this.prisma.cashRegister.count({ where }),
    ]);

    return {
      success: true,
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(user: any, id: number) {
    const register = await this.prisma.cashRegister.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        movements: {
          orderBy: { createdAt: 'desc' },
          include: { sale: { select: { id: true, code: true } } },
        },
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        local: { select: { id: true, name: true } },
      },
    });
    if (!register) throw new NotFoundException('Caja no encontrada');

    return {
      success: true,
      data: { ...register, totals: computeTotals(register) },
    };
  }

  // Usado por ventas: si hay caja abierta en el local, registra el efectivo.
  async registerCashSale(
    localId: number,
    companyId: number,
    saleId: number,
    amount: number,
    userId?: number,
  ) {
    const register = await this.prisma.cashRegister.findFirst({
      where: { localId, companyId, status: 'ABIERTA' },
    });
    if (!register) return null;

    return this.prisma.cashMovement.create({
      data: {
        cashRegisterId: register.id,
        type: 'INGRESO',
        amount,
        concept: 'Venta en efectivo',
        saleId,
        userId,
      },
    });
  }
}
