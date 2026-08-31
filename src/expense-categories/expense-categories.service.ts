import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '@/prisma.service';

// Solo dueño/administrador administra los tipos de gasto.
const ADMIN_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN];

// Categorías base (equivalen al enum ExpenseType) que se precargan por empresa.
const DEFAULTS: { code: string; name: string }[] = [
  { code: 'ARRIENDO', name: 'Arriendo' },
  { code: 'SERVICIOS_PUBLICOS', name: 'Servicios públicos' },
  { code: 'EMPLEADOS', name: 'Empleados / nómina' },
  { code: 'TRANSPORTE', name: 'Transporte' },
  { code: 'PEDIDOS', name: 'Pedidos / mercancía' },
  { code: 'PLAN_CELULAR', name: 'Plan celular' },
  { code: 'PLAN_INTERNET', name: 'Plan internet' },
  { code: 'ASEO', name: 'Aseo' },
  { code: 'MANTENIMIENTO', name: 'Mantenimiento' },
  { code: 'PUBLICIDAD', name: 'Publicidad' },
  { code: 'IMPUESTOS', name: 'Impuestos' },
  { code: 'COMISIONES', name: 'Comisiones' },
  { code: 'OTROS', name: 'Otros' },
];

@Injectable()
export class ExpenseCategoriesService {
  constructor(private prisma: PrismaService) {}

  private assertAdmin(user: any) {
    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('No tienes permisos');
    }
  }

  // Precarga las categorías base la primera vez que una empresa las consulta.
  private async ensureSeeded(companyId: number) {
    const count = await this.prisma.expenseCategory.count({
      where: { companyId, status: { not: 'ELIMINADO' as any } },
    });
    if (count > 0) return;
    await this.prisma.expenseCategory.createMany({
      data: DEFAULTS.map((d) => ({ companyId, name: d.name, code: d.code })),
    });
  }

  async findAll(user: any) {
    await this.ensureSeeded(user.companyId);
    const rows = await this.prisma.expenseCategory.findMany({
      where: { companyId: user.companyId, status: { not: 'ELIMINADO' as any } },
      orderBy: { name: 'asc' },
    });
    // Marca cuántos gastos usa cada una (para avisar antes de borrar).
    const counts = await this.prisma.expense.groupBy({
      by: ['expenseCategoryId'],
      where: {
        expenseCategoryId: { in: rows.map((r) => r.id) },
        status: { not: 'ELIMINADO' as any },
      },
      _count: { _all: true },
    });
    const usage = new Map(
      counts.map((c) => [c.expenseCategoryId, c._count._all]),
    );
    return {
      success: true,
      data: rows.map((r) => ({
        ...r,
        isBase: !!r.code,
        usageCount: usage.get(r.id) || 0,
      })),
    };
  }

  async create(user: any, dto: any) {
    this.assertAdmin(user);
    const name = String(dto?.name || '').trim();
    if (!name) throw new BadRequestException('El nombre es obligatorio');
    const dup = await this.prisma.expenseCategory.findFirst({
      where: {
        companyId: user.companyId,
        name: { equals: name, mode: 'insensitive' },
        status: { not: 'ELIMINADO' as any },
      },
    });
    if (dup) throw new BadRequestException('Ya existe una categoría con ese nombre');
    const cat = await this.prisma.expenseCategory.create({
      data: { companyId: user.companyId, name },
    });
    return { success: true, data: cat };
  }

  private async own(user: any, id: number) {
    const cat = await this.prisma.expenseCategory.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!cat) throw new NotFoundException('Categoría no encontrada');
    return cat;
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
    const cat = await this.prisma.expenseCategory.update({
      where: { id },
      data,
    });
    return { success: true, data: cat };
  }

  async remove(user: any, id: number) {
    this.assertAdmin(user);
    await this.own(user, id);
    // Borrado lógico para conservar el histórico de gastos que la referencian.
    await this.prisma.expenseCategory.update({
      where: { id },
      data: { status: 'ELIMINADO' as any },
    });
    return { success: true };
  }
}
