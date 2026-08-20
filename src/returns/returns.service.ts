import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { CreateReturnDto } from './dto/return.dto';

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getScopedSale(saleId: number, companyId: number) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, local: { is: { companyId } } },
      include: {
        items: {
          include: { variant: { include: { inventory: true } }, service: true },
        },
        customer: true,
        local: true,
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return sale;
  }

  // Devuelve la venta con, por cada ítem, cuánto se vendió y cuánto ya se
  // devolvió (para armar el formulario de devolución).
  async getSaleForReturn(user: any, saleId: number) {
    const sale = await this.getScopedSale(saleId, user.companyId);

    const returned = await this.prisma.returnItem.groupBy({
      by: ['saleItemId'],
      where: { return: { is: { saleId, status: 'REGISTRADA' } } },
      _sum: { quantity: true },
    });
    const returnedMap = new Map(
      returned.map((r) => [r.saleItemId, r._sum.quantity || 0]),
    );

    const items = sale.items.map((it) => {
      const already = returnedMap.get(it.id) || 0;
      return {
        saleItemId: it.id,
        name: it.variant?.inventory?.name || it.service?.name || 'Ítem',
        color: it.variant?.color,
        size: it.variant?.size,
        inventoryVariantId: it.inventoryVariantId,
        price: it.price,
        soldQuantity: it.quantity,
        returnedQuantity: already,
        remaining: it.quantity - already,
      };
    });

    return {
      success: true,
      data: {
        id: sale.id,
        code: sale.code,
        customer: sale.customer,
        totalAmount: sale.totalAmount,
        saleDate: sale.saleDate,
        items,
      },
    };
  }

  async create(user: any, dto: CreateReturnDto) {
    const sale = await this.getScopedSale(dto.saleId, user.companyId);

    // Cuánto se ha devuelto ya por cada línea.
    const prev = await this.prisma.returnItem.groupBy({
      by: ['saleItemId'],
      where: { return: { is: { saleId: dto.saleId, status: 'REGISTRADA' } } },
      _sum: { quantity: true },
    });
    const prevMap = new Map(prev.map((r) => [r.saleItemId, r._sum.quantity || 0]));
    const saleItemById = new Map(sale.items.map((it) => [it.id, it]));

    const lines = dto.items
      .filter((i) => i.quantity > 0)
      .map((i) => {
        const si = saleItemById.get(i.saleItemId);
        if (!si) {
          throw new BadRequestException(
            `La línea ${i.saleItemId} no pertenece a esta venta.`,
          );
        }
        const already = prevMap.get(i.saleItemId) || 0;
        const remaining = si.quantity - already;
        if (i.quantity > remaining) {
          throw new BadRequestException(
            `No puedes devolver ${i.quantity} de "${
              si.variant?.inventory?.name || si.service?.name
            }": solo quedan ${remaining}.`,
          );
        }
        return {
          saleItemId: si.id,
          inventoryVariantId: si.inventoryVariantId,
          name: si.variant?.inventory?.name || si.service?.name || 'Ítem',
          quantity: i.quantity,
          price: si.price,
          subtotal: si.price * i.quantity,
        };
      });

    if (lines.length === 0) {
      throw new BadRequestException('Debes devolver al menos un ítem.');
    }

    const total = lines.reduce((s, l) => s + l.subtotal, 0);

    const created = await this.prisma.$transaction(async (tx) => {
      const ret = await tx.return.create({
        data: {
          code: `DEV-${Date.now()}`,
          saleId: dto.saleId,
          localId: sale.localId,
          companyId: user.companyId,
          userId: user.id,
          reason: dto.reason,
          total,
          items: { create: lines },
        },
        include: { items: true },
      });

      // Reingreso de stock de los productos devueltos (los servicios no tienen).
      for (const l of lines) {
        if (l.inventoryVariantId) {
          await tx.inventoryVariant.update({
            where: { id: l.inventoryVariantId },
            data: { stock: { increment: l.quantity } },
          });
        }
      }

      // Caja: si hay una caja abierta en el local, registra el egreso del
      // dinero devuelto para que el arqueo cuadre.
      const openReg = await tx.cashRegister.findFirst({
        where: { localId: sale.localId, companyId: user.companyId, status: 'ABIERTA' },
        select: { id: true },
      });
      if (openReg) {
        await tx.cashMovement.create({
          data: {
            cashRegisterId: openReg.id,
            type: 'EGRESO',
            amount: total,
            concept: `Devolución ${ret.code}`,
            saleId: dto.saleId,
            userId: user.id,
          },
        });
      }

      // Si ya se devolvió todo lo vendido, marca la venta como DEVUELTA.
      const totalReturnedAfter = await tx.returnItem.aggregate({
        where: { return: { is: { saleId: dto.saleId, status: 'REGISTRADA' } } },
        _sum: { quantity: true },
      });
      const totalSold = sale.items.reduce((s, it) => s + it.quantity, 0);
      if ((totalReturnedAfter._sum.quantity || 0) >= totalSold) {
        await tx.sale.update({
          where: { id: dto.saleId },
          data: { saleStatus: 'DEVUELTA' },
        });
      }

      return ret;
    });

    return { success: true, message: 'Devolución registrada', data: created };
  }

  async findAll(user: any, query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = { companyId: user.companyId };
    if (query.code) where.code = { contains: query.code, mode: 'insensitive' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.return.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sale: { select: { id: true, code: true } },
          user: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.return.count({ where }),
    ]);

    return {
      success: true,
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(user: any, id: number) {
    const ret = await this.prisma.return.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        sale: { select: { id: true, code: true, customer: true } },
        user: { select: { id: true, name: true } },
        items: true,
      },
    });
    if (!ret) throw new NotFoundException('Devolución no encontrada');
    return { success: true, data: ret };
  }
}
