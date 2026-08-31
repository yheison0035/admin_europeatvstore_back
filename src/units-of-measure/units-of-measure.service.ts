import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '@/prisma.service';

const ADMIN_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN];

// code: UNIDAD (cantidades enteras) | PESO (admite decimales: kg, litros…).
const VALID_CODES = ['UNIDAD', 'PESO'];

const DEFAULTS: { code: string; name: string }[] = [
  { code: 'UNIDAD', name: 'UNIDAD' },
  { code: 'PESO', name: 'KILOGRAMO' },
  { code: 'PESO', name: 'LIBRA' },
  { code: 'PESO', name: 'GRAMO' },
  { code: 'PESO', name: 'LITRO' },
  { code: 'PESO', name: 'MILILITRO' },
  { code: 'PESO', name: 'METRO' },
  { code: 'UNIDAD', name: 'CAJA' },
  { code: 'UNIDAD', name: 'DOCENA' },
  { code: 'UNIDAD', name: 'PAQUETE' },
  { code: 'UNIDAD', name: 'BOLSA' },
];

@Injectable()
export class UnitsOfMeasureService {
  constructor(private prisma: PrismaService) {}

  private assertAdmin(user: any) {
    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('No tienes permisos');
    }
  }

  private async ensureSeeded(companyId: number) {
    const count = await this.prisma.unitOfMeasure.count({
      where: { companyId, status: { not: 'ELIMINADO' as any } },
    });
    if (count > 0) return;
    await this.prisma.unitOfMeasure.createMany({
      data: DEFAULTS.map((d) => ({ companyId, name: d.name, code: d.code })),
    });
  }

  async findAll(user: any) {
    await this.ensureSeeded(user.companyId);
    const rows = await this.prisma.unitOfMeasure.findMany({
      where: { companyId: user.companyId, status: { not: 'ELIMINADO' as any } },
      orderBy: { name: 'asc' },
    });
    const counts = await this.prisma.inventory.groupBy({
      by: ['unitId'],
      where: { unitId: { in: rows.map((r) => r.id) } },
      _count: { _all: true },
    });
    const usage = new Map(counts.map((c) => [c.unitId, c._count._all]));
    return {
      success: true,
      data: rows.map((r) => ({
        ...r,
        isBase: DEFAULTS.some((d) => d.name === r.name),
        usageCount: usage.get(r.id) || 0,
      })),
    };
  }

  private code(v: any): string {
    const c = String(v || 'UNIDAD').toUpperCase();
    if (!VALID_CODES.includes(c)) {
      throw new BadRequestException('Comportamiento inválido (UNIDAD o PESO)');
    }
    return c;
  }

  async create(user: any, dto: any) {
    this.assertAdmin(user);
    const name = String(dto?.name || '').trim().toUpperCase();
    if (!name) throw new BadRequestException('El nombre es obligatorio');
    const code = this.code(dto?.code);
    const dup = await this.prisma.unitOfMeasure.findFirst({
      where: {
        companyId: user.companyId,
        name: { equals: name, mode: 'insensitive' },
        status: { not: 'ELIMINADO' as any },
      },
    });
    if (dup) throw new BadRequestException('Ya existe una unidad con ese nombre');
    const row = await this.prisma.unitOfMeasure.create({
      data: { companyId: user.companyId, name, code },
    });
    return { success: true, data: row };
  }

  private async own(user: any, id: number) {
    const row = await this.prisma.unitOfMeasure.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!row) throw new NotFoundException('Unidad no encontrada');
    return row;
  }

  async update(user: any, id: number, dto: any) {
    this.assertAdmin(user);
    await this.own(user, id);
    const data: any = {};
    if (dto.name !== undefined) {
      const name = String(dto.name).trim().toUpperCase();
      if (!name) throw new BadRequestException('El nombre es obligatorio');
      data.name = name;
    }
    if (dto.code !== undefined) data.code = this.code(dto.code);
    const row = await this.prisma.unitOfMeasure.update({ where: { id }, data });
    return { success: true, data: row };
  }

  async remove(user: any, id: number) {
    this.assertAdmin(user);
    await this.own(user, id);
    const active = await this.prisma.unitOfMeasure.count({
      where: { companyId: user.companyId, status: { not: 'ELIMINADO' as any } },
    });
    if (active <= 1) {
      throw new BadRequestException('Debe quedar al menos una unidad activa.');
    }
    await this.prisma.unitOfMeasure.update({
      where: { id },
      data: { status: 'ELIMINADO' as any },
    });
    return { success: true };
  }
}
