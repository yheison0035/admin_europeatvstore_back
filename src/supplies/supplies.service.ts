import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { getAccessibleLocalIds } from '@/common/access-locals.util';
import { CreateSupplyDto } from './dto/create-supply.dto';
import { UpdateSupplyDto } from './dto/update-supply.dto';
import { AdjustSupplyDto } from './dto/adjust-supply.dto';

@Injectable()
export class SuppliesService {
  constructor(private prisma: PrismaService) {}

  // Lista de insumos de la empresa (por locales accesibles), con marca de bajo.
  async findAll(user: any, query: any = {}) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);
    const where: any = { companyId: user.companyId };
    if (localIds !== null) where.localId = { in: localIds };
    if (query.search) {
      where.name = { contains: String(query.search), mode: 'insensitive' };
    }

    const supplies = await this.prisma.supply.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        provider: { select: { id: true, name: true } },
        local: { select: { id: true, name: true } },
      },
    });

    return {
      success: true,
      data: supplies.map((s) => ({
        ...s,
        lowStock: s.minStock != null && s.stock <= s.minStock,
      })),
    };
  }

  async create(dto: CreateSupplyDto, user: any) {
    const localId = Number(dto.localId);
    const local = await this.prisma.local.findFirst({
      where: { id: localId, companyId: user.companyId },
    });
    if (!local) throw new ForbiddenException('Local no válido');

    const stock = Number(dto.stock) || 0;
    const supply = await this.prisma.supply.create({
      data: {
        name: dto.name,
        unit: dto.unit || 'UNIDAD',
        stock,
        minStock: dto.minStock != null ? Number(dto.minStock) : null,
        cost: Number(dto.cost) || 0,
        providerId: dto.providerId ? Number(dto.providerId) : null,
        localId,
        companyId: user.companyId,
      },
    });

    // Registra la carga inicial como un movimiento de entrada.
    if (stock > 0) {
      await this.prisma.supplyMovement.create({
        data: {
          supplyId: supply.id,
          type: 'ENTRADA',
          quantity: stock,
          reason: 'Carga inicial',
          userId: user.id,
          companyId: user.companyId,
        },
      });
    }

    return { success: true, data: supply };
  }

  async update(id: number, dto: UpdateSupplyDto, user: any) {
    const supply = await this.prisma.supply.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!supply) throw new NotFoundException('Insumo no encontrado');

    const updated = await this.prisma.supply.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.unit !== undefined && { unit: dto.unit }),
        ...(dto.minStock !== undefined && {
          minStock: dto.minStock === null ? null : Number(dto.minStock),
        }),
        ...(dto.cost !== undefined && { cost: Number(dto.cost) }),
        ...(dto.providerId !== undefined && {
          providerId: dto.providerId ? Number(dto.providerId) : null,
        }),
        ...(dto.status !== undefined && { status: dto.status as any }),
      },
    });
    return { success: true, data: updated };
  }

  async remove(id: number, user: any) {
    const supply = await this.prisma.supply.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!supply) throw new NotFoundException('Insumo no encontrado');
    await this.prisma.supply.delete({ where: { id } });
    return { success: true };
  }

  // Entrada / salida / ajuste de existencias del insumo, con historial.
  async adjust(id: number, dto: AdjustSupplyDto, user: any) {
    const supply = await this.prisma.supply.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!supply) throw new NotFoundException('Insumo no encontrado');

    const qty = Number(dto.quantity) || 0;
    let newStock = supply.stock;
    if (dto.type === 'ENTRADA') newStock = supply.stock + qty;
    else if (dto.type === 'SALIDA') newStock = supply.stock - qty;
    else if (dto.type === 'AJUSTE') newStock = qty;

    if (newStock < 0) {
      throw new BadRequestException('No hay suficiente existencia del insumo');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.supply.update({
        where: { id },
        data: { stock: newStock },
      }),
      this.prisma.supplyMovement.create({
        data: {
          supplyId: id,
          type: dto.type,
          quantity: qty,
          reason: dto.reason ?? null,
          userId: user.id,
          companyId: user.companyId,
        },
      }),
    ]);

    return { success: true, data: updated };
  }

  async movements(id: number, user: any) {
    const supply = await this.prisma.supply.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true },
    });
    if (!supply) throw new NotFoundException('Insumo no encontrado');

    const movements = await this.prisma.supplyMovement.findMany({
      where: { supplyId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { success: true, data: movements };
  }
}
