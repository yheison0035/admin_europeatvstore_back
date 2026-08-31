import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '@/prisma.service';

const ADMIN_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN];

// Categorías base (equivalen al enum EmployeeChargeType).
const DEFAULTS: { code: string; name: string }[] = [
  { code: 'MEMBRESIA', name: 'Membresía' },
  { code: 'PRESTAMO', name: 'Préstamo' },
  { code: 'PRODUCTO', name: 'Producto' },
  { code: 'OTRO', name: 'Otro' },
];

@Injectable()
export class ChargeCategoriesService {
  constructor(private prisma: PrismaService) {}

  private assertAdmin(user: any) {
    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('No tienes permisos');
    }
  }

  private async ensureSeeded(companyId: number) {
    const count = await this.prisma.chargeCategory.count({
      where: { companyId, status: { not: 'ELIMINADO' as any } },
    });
    if (count > 0) return;
    await this.prisma.chargeCategory.createMany({
      data: DEFAULTS.map((d) => ({ companyId, name: d.name, code: d.code })),
    });
  }

  async findAll(user: any) {
    await this.ensureSeeded(user.companyId);
    const rows = await this.prisma.chargeCategory.findMany({
      where: { companyId: user.companyId, status: { not: 'ELIMINADO' as any } },
      orderBy: { name: 'asc' },
    });
    const counts = await this.prisma.employeeCharge.groupBy({
      by: ['chargeCategoryId'],
      where: { chargeCategoryId: { in: rows.map((r) => r.id) } },
      _count: { _all: true },
    });
    const usage = new Map(counts.map((c) => [c.chargeCategoryId, c._count._all]));
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
    const dup = await this.prisma.chargeCategory.findFirst({
      where: {
        companyId: user.companyId,
        name: { equals: name, mode: 'insensitive' },
        status: { not: 'ELIMINADO' as any },
      },
    });
    if (dup) throw new BadRequestException('Ya existe una categoría con ese nombre');
    const cat = await this.prisma.chargeCategory.create({
      data: { companyId: user.companyId, name },
    });
    return { success: true, data: cat };
  }

  private async own(user: any, id: number) {
    const cat = await this.prisma.chargeCategory.findFirst({
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
    const cat = await this.prisma.chargeCategory.update({ where: { id }, data });
    return { success: true, data: cat };
  }

  async remove(user: any, id: number) {
    this.assertAdmin(user);
    await this.own(user, id);
    await this.prisma.chargeCategory.update({
      where: { id },
      data: { status: 'ELIMINADO' as any },
    });
    return { success: true };
  }
}
