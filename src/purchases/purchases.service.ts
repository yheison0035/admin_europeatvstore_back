import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { CreatePurchaseDto } from './dto/purchase.dto';

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertLocalInCompany(localId: number, companyId: number) {
    const local = await this.prisma.local.findFirst({
      where: { id: localId, companyId },
    });
    if (!local) throw new NotFoundException('Local no encontrado');
  }

  async create(user: any, dto: CreatePurchaseDto) {
    await this.assertLocalInCompany(dto.localId, user.companyId);

    // Validar que todas las variantes existan y pertenezcan a la empresa.
    const variantIds = dto.items.map((i) => i.inventoryVariantId);
    const variants = await this.prisma.inventoryVariant.findMany({
      where: {
        id: { in: variantIds },
        inventory: { is: { local: { is: { companyId: user.companyId } } } },
      },
      select: { id: true },
    });
    const validIds = new Set(variants.map((v) => v.id));
    for (const it of dto.items) {
      if (!validIds.has(it.inventoryVariantId)) {
        throw new BadRequestException(
          `La variante ${it.inventoryVariantId} no pertenece a tu empresa.`,
        );
      }
    }

    const itemsData = dto.items.map((it) => ({
      inventoryVariantId: it.inventoryVariantId,
      quantity: it.quantity,
      unitCost: it.unitCost,
      subtotal: it.quantity * it.unitCost,
    }));
    const total = itemsData.reduce((s, i) => s + i.subtotal, 0);

    const purchase = await this.prisma.purchase.create({
      data: {
        code: `COMPRA-${Date.now()}`,
        localId: dto.localId,
        companyId: user.companyId,
        providerId: dto.providerId ?? null,
        notes: dto.notes,
        userId: user.id,
        total,
        items: { create: itemsData },
      },
      include: { items: true },
    });

    return { success: true, message: 'Compra registrada', data: purchase };
  }

  async findAll(user: any, query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = { companyId: user.companyId };
    if (query.status) where.status = query.status;
    if (query.code) where.code = { contains: query.code, mode: 'insensitive' };
    if (query.localId && /^\d+$/.test(String(query.localId))) {
      where.localId = Number(query.localId);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchase.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          provider: { select: { id: true, name: true } },
          local: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.purchase.count({ where }),
    ]);

    return {
      success: true,
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(user: any, id: number) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        provider: true,
        local: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        items: {
          include: {
            variant: {
              include: { inventory: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    return { success: true, data: purchase };
  }

  // Recibe la mercancía: suma el stock de cada variante y actualiza el costo
  // de compra del producto. Idempotente por estado (solo si está PENDIENTE).
  async receive(user: any, id: number) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, companyId: user.companyId },
      include: { items: true },
    });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    if (purchase.status === 'RECIBIDA') {
      throw new BadRequestException('Esta compra ya fue recibida.');
    }
    if (purchase.status === 'CANCELADA') {
      throw new BadRequestException('Esta compra está cancelada.');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const it of purchase.items) {
        await tx.inventoryVariant.update({
          where: { id: it.inventoryVariantId },
          data: { stock: { increment: it.quantity } },
        });
        // Actualiza el costo de compra del producto al último costo pagado.
        const variant = await tx.inventoryVariant.findUnique({
          where: { id: it.inventoryVariantId },
          select: { inventoryId: true },
        });
        if (variant) {
          await tx.inventory.update({
            where: { id: variant.inventoryId },
            data: { purchasePrice: it.unitCost },
          });
        }
      }
      await tx.purchase.update({
        where: { id },
        data: { status: 'RECIBIDA', receivedAt: new Date() },
      });
    });

    return this.findOne(user, id);
  }

  async cancel(user: any, id: number) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    if (purchase.status === 'RECIBIDA') {
      throw new BadRequestException(
        'No se puede cancelar una compra ya recibida.',
      );
    }
    await this.prisma.purchase.update({
      where: { id },
      data: { status: 'CANCELADA' },
    });
    return { success: true, message: 'Compra cancelada' };
  }

  async remove(user: any, id: number) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    if (purchase.status === 'RECIBIDA') {
      throw new BadRequestException(
        'No se puede eliminar una compra ya recibida.',
      );
    }
    await this.prisma.purchase.delete({ where: { id } });
    return { success: true, message: 'Compra eliminada' };
  }
}
