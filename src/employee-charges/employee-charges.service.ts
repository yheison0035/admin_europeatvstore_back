import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeChargeType, Role } from '@prisma/client';
import { PrismaService } from '@/prisma.service';
import { CreateEmployeeChargeDto } from './dto/create-employee-charge.dto';

// Roles que administran los cargos (el dueño/administrador del negocio).
const OWNER_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN];

@Injectable()
export class EmployeeChargesService {
  constructor(private prisma: PrismaService) {}

  private isOwner(user: any) {
    return OWNER_ROLES.includes(user.role);
  }

  // Listado. El dueño ve todos (filtra por empleado/estado); el empleado solo
  // los suyos (solo lectura).
  async findAll(user: any, query: any = {}) {
    const where: any = { companyId: user.companyId };

    if (this.isOwner(user)) {
      if (query.userId) where.userId = Number(query.userId);
    } else {
      // El empleado solo ve su propia cuenta.
      where.userId = user.id;
    }
    if (query.status) where.status = String(query.status).toUpperCase();

    const charges = await this.prisma.employeeCharge.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { chargeCategory: { select: { name: true } } },
    });

    // Adjunta el nombre del empleado para pintarlo (sin exponer datos sensibles).
    const userIds = [...new Set(charges.map((c) => c.userId))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    return {
      success: true,
      data: charges.map((c) => ({
        ...c,
        userName: nameById.get(c.userId) || null,
        categoryName: c.chargeCategory?.name || null,
      })),
    };
  }

  // Saldo del empleado (pendiente / pagado / descontado / total).
  async summary(user: any, query: any = {}) {
    const userId = this.isOwner(user)
      ? query.userId
        ? Number(query.userId)
        : undefined
      : user.id;

    const where: any = { companyId: user.companyId };
    if (userId) where.userId = userId;

    const charges = await this.prisma.employeeCharge.findMany({
      where,
      select: { amount: true, status: true },
    });

    const sum = (st: string) =>
      charges
        .filter((c) => c.status === st)
        .reduce((s, c) => s + c.amount, 0);

    return {
      success: true,
      data: {
        pending: sum('PENDIENTE'),
        paid: sum('PAGADO'),
        discounted: sum('DESCONTADO'),
        total: charges.reduce((s, c) => s + c.amount, 0),
        count: charges.length,
      },
    };
  }

  // Deriva el enum `type` a partir de la categoría elegida (para compatibilidad).
  private async resolveCategory(
    companyId: number,
    dto: any,
  ): Promise<{ chargeCategoryId: number | null; type: EmployeeChargeType }> {
    if (dto.chargeCategoryId) {
      const cat = await this.prisma.chargeCategory.findFirst({
        where: { id: Number(dto.chargeCategoryId), companyId },
      });
      if (cat) {
        const code = cat.code || '';
        const type = (Object.values(EmployeeChargeType) as string[]).includes(
          code,
        )
          ? (code as EmployeeChargeType)
          : EmployeeChargeType.OTRO;
        return { chargeCategoryId: cat.id, type };
      }
    }
    return {
      chargeCategoryId: null,
      type: (dto.type as EmployeeChargeType) ?? EmployeeChargeType.OTRO,
    };
  }

  async create(dto: CreateEmployeeChargeDto, user: any) {
    if (!this.isOwner(user)) throw new ForbiddenException('No tienes permisos');

    // El empleado debe pertenecer a la misma empresa.
    const emp = await this.prisma.user.findFirst({
      where: { id: Number(dto.userId), companyId: user.companyId },
      select: { id: true },
    });
    if (!emp) throw new BadRequestException('Empleado no válido');

    const { chargeCategoryId, type } = await this.resolveCategory(
      user.companyId,
      dto,
    );

    const charge = await this.prisma.employeeCharge.create({
      data: {
        companyId: user.companyId,
        userId: Number(dto.userId),
        type,
        chargeCategoryId,
        concept: dto.concept,
        amount: Number(dto.amount),
        notes: dto.notes ?? null,
        saleId: dto.saleId ?? null,
        createdById: user.id,
        createdByName: user.name ?? null,
      },
    });
    return { success: true, data: charge };
  }

  private async own(id: number, user: any) {
    const charge = await this.prisma.employeeCharge.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!charge) throw new NotFoundException('Cargo no encontrado');
    return charge;
  }

  async update(id: number, dto: any, user: any) {
    if (!this.isOwner(user)) throw new ForbiddenException('No tienes permisos');
    await this.own(id, user);
    const catData =
      dto.chargeCategoryId !== undefined
        ? await this.resolveCategory(user.companyId, dto)
        : null;

    const updated = await this.prisma.employeeCharge.update({
      where: { id },
      data: {
        ...(dto.concept !== undefined && { concept: dto.concept }),
        ...(dto.amount !== undefined && { amount: Number(dto.amount) }),
        ...(catData
          ? { chargeCategoryId: catData.chargeCategoryId, type: catData.type }
          : dto.type !== undefined && { type: dto.type }),
        ...(dto.notes !== undefined && { notes: dto.notes || null }),
      },
    });
    return { success: true, data: updated };
  }

  // Saldar: EFECTIVO (respondió en efectivo) o COMISION (se descuenta del pago).
  async settle(id: number, dto: any, user: any) {
    if (!this.isOwner(user)) throw new ForbiddenException('No tienes permisos');
    await this.own(id, user);
    const method = String(dto?.method || '').toUpperCase();
    if (!['EFECTIVO', 'COMISION'].includes(method)) {
      throw new BadRequestException('Método inválido (EFECTIVO o COMISION)');
    }
    const status = method === 'EFECTIVO' ? 'PAGADO' : 'DESCONTADO';
    // Fecha del pago elegida por el dueño (para saber qué día pagó); si no
    // llega, se usa hoy.
    const settledAt = dto?.settledAt ? new Date(dto.settledAt) : new Date();
    const updated = await this.prisma.employeeCharge.update({
      where: { id },
      data: { status, settledMethod: method, settledAt },
    });
    return { success: true, data: updated };
  }

  // Volver a dejarlo pendiente (deshacer el saldado).
  async unsettle(id: number, user: any) {
    if (!this.isOwner(user)) throw new ForbiddenException('No tienes permisos');
    await this.own(id, user);
    const updated = await this.prisma.employeeCharge.update({
      where: { id },
      data: { status: 'PENDIENTE', settledMethod: null, settledAt: null },
    });
    return { success: true, data: updated };
  }

  async remove(id: number, user: any) {
    if (!this.isOwner(user)) throw new ForbiddenException('No tienes permisos');
    await this.own(id, user);
    await this.prisma.employeeCharge.delete({ where: { id } });
    return { success: true };
  }
}
