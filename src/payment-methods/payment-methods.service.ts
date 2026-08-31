import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, Role } from '@prisma/client';
import { PrismaService } from '@/prisma.service';

const ADMIN_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN];

// Métodos base (comportamiento). El "code" define la lógica: EFECTIVO mueve
// caja, CREDITO marca fiado, el resto va como pago normal (banco).
const DEFAULTS: { code: PaymentMethod; name: string }[] = [
  { code: 'EFECTIVO', name: 'Efectivo' },
  { code: 'BANCOLOMBIA', name: 'Bancolombia' },
  { code: 'TRANSFERENCIA', name: 'Transferencia' },
  { code: 'DATAFONO', name: 'Datáfono' },
  { code: 'ADDI', name: 'Addi' },
  { code: 'CREDITO', name: 'Crédito (fiado)' },
];

const VALID_CODES = Object.values(PaymentMethod) as string[];

@Injectable()
export class PaymentMethodsService {
  constructor(private prisma: PrismaService) {}

  private assertAdmin(user: any) {
    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('No tienes permisos');
    }
  }

  private async ensureSeeded(companyId: number) {
    const count = await this.prisma.paymentMethodCatalog.count({
      where: { companyId, status: { not: 'ELIMINADO' as any } },
    });
    if (count > 0) return;
    await this.prisma.paymentMethodCatalog.createMany({
      data: DEFAULTS.map((d) => ({ companyId, name: d.name, code: d.code })),
    });
  }

  // Lista para el CRUD (dueño) o para los selects (POS/gastos): activos.
  async findAll(user: any) {
    await this.ensureSeeded(user.companyId);
    const rows = await this.prisma.paymentMethodCatalog.findMany({
      where: { companyId: user.companyId, status: { not: 'ELIMINADO' as any } },
      orderBy: { name: 'asc' },
    });
    const counts = await this.prisma.sale.groupBy({
      by: ['paymentMethodCatalogId'],
      where: { paymentMethodCatalogId: { in: rows.map((r) => r.id) } },
      _count: { _all: true },
    });
    const usage = new Map(
      counts.map((c) => [c.paymentMethodCatalogId, c._count._all]),
    );
    // isBase: coincide nombre+code con un método base (para no dejar borrarlos todos).
    return {
      success: true,
      data: rows.map((r) => ({
        ...r,
        isBase: DEFAULTS.some((d) => d.code === r.code && d.name === r.name),
        usageCount: usage.get(r.id) || 0,
      })),
    };
  }

  private validateCode(code: any): PaymentMethod {
    if (!VALID_CODES.includes(code)) {
      throw new BadRequestException('Comportamiento (code) inválido');
    }
    return code as PaymentMethod;
  }

  async create(user: any, dto: any) {
    this.assertAdmin(user);
    const name = String(dto?.name || '').trim();
    if (!name) throw new BadRequestException('El nombre es obligatorio');
    const code = this.validateCode(dto?.code);
    const dup = await this.prisma.paymentMethodCatalog.findFirst({
      where: {
        companyId: user.companyId,
        name: { equals: name, mode: 'insensitive' },
        status: { not: 'ELIMINADO' as any },
      },
    });
    if (dup) throw new BadRequestException('Ya existe un método con ese nombre');
    const row = await this.prisma.paymentMethodCatalog.create({
      data: { companyId: user.companyId, name, code },
    });
    return { success: true, data: row };
  }

  private async own(user: any, id: number) {
    const row = await this.prisma.paymentMethodCatalog.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!row) throw new NotFoundException('Método no encontrado');
    return row;
  }

  async update(user: any, id: number, dto: any) {
    this.assertAdmin(user);
    await this.own(user, id);
    const data: any = {};
    if (dto.name !== undefined) {
      const name = String(dto.name).trim();
      if (!name) throw new BadRequestException('El nombre es obligatorio');
      data.name = name;
    }
    if (dto.code !== undefined) data.code = this.validateCode(dto.code);
    const row = await this.prisma.paymentMethodCatalog.update({
      where: { id },
      data,
    });
    return { success: true, data: row };
  }

  async remove(user: any, id: number) {
    this.assertAdmin(user);
    await this.own(user, id);
    const active = await this.prisma.paymentMethodCatalog.count({
      where: {
        companyId: user.companyId,
        status: { not: 'ELIMINADO' as any },
      },
    });
    if (active <= 1) {
      throw new BadRequestException(
        'Debe quedar al menos un método de pago activo.',
      );
    }
    await this.prisma.paymentMethodCatalog.update({
      where: { id },
      data: { status: 'ELIMINADO' as any },
    });
    return { success: true };
  }
}
