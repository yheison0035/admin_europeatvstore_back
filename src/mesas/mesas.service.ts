import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { getAccessibleLocalIds } from '@/common/access-locals.util';

@Injectable()
export class MesasService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: any) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);
    const where: any = { companyId: user.companyId };
    if (localIds !== null) where.localId = { in: localIds };

    const mesas = await this.prisma.mesa.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        local: { select: { id: true, name: true } },
        comandas: {
          where: { status: { notIn: ['COBRADA', 'CANCELADA'] } },
          select: { id: true, total: true, status: true },
        },
      },
    });

    return {
      success: true,
      data: mesas.map((m) => ({
        id: m.id,
        name: m.name,
        status: m.status,
        local: m.local,
        localId: m.localId,
        openComandaId: m.comandas[0]?.id || null,
        openTotal: m.comandas.reduce((s, c) => s + c.total, 0),
        openCount: m.comandas.length,
      })),
    };
  }

  async create(dto: any, user: any) {
    const localId = Number(dto.localId);
    const local = await this.prisma.local.findFirst({
      where: { id: localId, companyId: user.companyId },
    });
    if (!local) throw new ForbiddenException('Local no válido');

    const mesa = await this.prisma.mesa.create({
      data: { name: dto.name, localId, companyId: user.companyId },
    });
    return { success: true, data: mesa };
  }

  async update(id: number, dto: any, user: any) {
    const mesa = await this.prisma.mesa.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!mesa) throw new NotFoundException('Mesa no encontrada');

    const updated = await this.prisma.mesa.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });
    return { success: true, data: updated };
  }

  async remove(id: number, user: any) {
    const mesa = await this.prisma.mesa.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!mesa) throw new NotFoundException('Mesa no encontrada');
    await this.prisma.mesa.delete({ where: { id } });
    return { success: true };
  }
}
