import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '@/prisma.service';

const ADMIN_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN];

const DEFAULTS = ['MINORISTA', 'MAYORISTA', 'VIP'];

@Injectable()
export class CustomerSegmentsService {
  constructor(private prisma: PrismaService) {}

  private assertAdmin(user: any) {
    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('No tienes permisos');
    }
  }

  private async ensureSeeded(companyId: number) {
    const count = await this.prisma.customerSegment.count({
      where: { companyId, status: { not: 'ELIMINADO' as any } },
    });
    if (count > 0) return;
    await this.prisma.customerSegment.createMany({
      data: DEFAULTS.map((name) => ({ companyId, name })),
    });
  }

  async findAll(user: any) {
    await this.ensureSeeded(user.companyId);
    const rows = await this.prisma.customerSegment.findMany({
      where: { companyId: user.companyId, status: { not: 'ELIMINADO' as any } },
      orderBy: { name: 'asc' },
    });
    const counts = await this.prisma.customer.groupBy({
      by: ['segmentId'],
      where: { segmentId: { in: rows.map((r) => r.id) } },
      _count: { _all: true },
    });
    const usage = new Map(counts.map((c) => [c.segmentId, c._count._all]));
    return {
      success: true,
      data: rows.map((r) => ({
        ...r,
        isBase: DEFAULTS.includes(r.name),
        usageCount: usage.get(r.id) || 0,
      })),
    };
  }

  async create(user: any, dto: any) {
    this.assertAdmin(user);
    const name = String(dto?.name || '').trim().toUpperCase();
    if (!name) throw new BadRequestException('El nombre es obligatorio');
    const dup = await this.prisma.customerSegment.findFirst({
      where: {
        companyId: user.companyId,
        name: { equals: name, mode: 'insensitive' },
        status: { not: 'ELIMINADO' as any },
      },
    });
    if (dup) throw new BadRequestException('Ya existe un segmento con ese nombre');
    const row = await this.prisma.customerSegment.create({
      data: { companyId: user.companyId, name },
    });
    return { success: true, data: row };
  }

  private async own(user: any, id: number) {
    const row = await this.prisma.customerSegment.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!row) throw new NotFoundException('Segmento no encontrado');
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
    const row = await this.prisma.customerSegment.update({ where: { id }, data });
    return { success: true, data: row };
  }

  async remove(user: any, id: number) {
    this.assertAdmin(user);
    await this.own(user, id);
    await this.prisma.customerSegment.update({
      where: { id },
      data: { status: 'ELIMINADO' as any },
    });
    return { success: true };
  }
}
