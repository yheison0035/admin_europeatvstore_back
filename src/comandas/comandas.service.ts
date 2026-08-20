import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { getAccessibleLocalIds } from '@/common/access-locals.util';

const KITCHEN_STATUSES = ['PENDIENTE', 'PREPARANDO', 'LISTO'];

@Injectable()
export class ComandasService {
  constructor(private prisma: PrismaService) {}

  // Resuelve nombre y precio de un ítem (producto o servicio) de la empresa.
  private async resolveItem(it: any, localId: number, companyId: number) {
    if (it.serviceId) {
      const service = await this.prisma.service.findFirst({
        where: { id: Number(it.serviceId), companyId },
        include: { serviceLocals: true },
      });
      if (!service) throw new NotFoundException('Servicio no válido');
      const sl = service.serviceLocals.find((s) => s.localId === localId);
      const price = sl ? sl.price : 0;
      return { name: service.name, price, serviceId: service.id, inventoryVariantId: null };
    }

    const variant = await this.prisma.inventoryVariant.findFirst({
      where: {
        id: Number(it.inventoryVariantId),
        inventory: { local: { companyId } },
      },
      include: { inventory: true },
    });
    if (!variant) throw new NotFoundException('Producto no válido');
    return {
      name: variant.inventory.name,
      price: variant.inventory.salePrice,
      serviceId: null,
      inventoryVariantId: variant.id,
    };
  }

  private async buildItems(items: any[], localId: number, companyId: number) {
    const data: any[] = [];
    let total = 0;
    for (const it of items || []) {
      if (!it.inventoryVariantId && !it.serviceId) continue;
      const r = await this.resolveItem(it, localId, companyId);
      const qty = Number(it.quantity) || 1;
      const subtotal = r.price * qty;
      data.push({
        inventoryVariantId: r.inventoryVariantId,
        serviceId: r.serviceId,
        name: r.name,
        quantity: qty,
        price: r.price,
        subtotal,
        notes: it.notes ?? null,
      });
      total += subtotal;
    }
    return { data, total };
  }

  // Crea una comanda (pedido). Si trae mesa, la marca OCUPADA.
  async create(dto: any, user: any) {
    const localId = Number(dto.localId);
    const local = await this.prisma.local.findFirst({
      where: { id: localId, companyId: user.companyId },
    });
    if (!local) throw new ForbiddenException('Local no válido');
    if (!dto.items?.length) {
      throw new BadRequestException('La comanda debe tener al menos un ítem');
    }

    const { data, total } = await this.buildItems(
      dto.items,
      localId,
      user.companyId,
    );

    const comanda = await this.prisma.comanda.create({
      data: {
        mesaId: dto.mesaId ? Number(dto.mesaId) : null,
        localId,
        companyId: user.companyId,
        userId: user.id,
        notes: dto.notes ?? null,
        total,
        items: { create: data },
      },
      include: { items: true, mesa: { select: { id: true, name: true } } },
    });

    if (dto.mesaId) {
      await this.prisma.mesa.update({
        where: { id: Number(dto.mesaId) },
        data: { status: 'OCUPADA' },
      });
    }

    return { success: true, data: comanda };
  }

  // Agrega ítems a una comanda existente y recalcula el total.
  async addItems(id: number, items: any[], user: any) {
    const comanda = await this.prisma.comanda.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!comanda) throw new NotFoundException('Comanda no encontrada');
    if (comanda.status === 'COBRADA') {
      throw new BadRequestException('La comanda ya fue cobrada');
    }

    const { data, total } = await this.buildItems(
      items,
      comanda.localId,
      user.companyId,
    );

    await this.prisma.comandaItem.createMany({
      data: data.map((d) => ({ ...d, comandaId: id })),
    });
    const updated = await this.prisma.comanda.update({
      where: { id },
      data: { total: comanda.total + total, status: 'PENDIENTE' },
      include: { items: true, mesa: { select: { id: true, name: true } } },
    });
    return { success: true, data: updated };
  }

  // Vista de cocina: comandas por preparar (por local accesible).
  async kitchen(user: any) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);
    const where: any = {
      companyId: user.companyId,
      status: { in: KITCHEN_STATUSES },
    };
    if (localIds !== null) where.localId = { in: localIds };

    const comandas = await this.prisma.comanda.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        items: true,
        mesa: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    });
    return { success: true, data: comandas };
  }

  // Comandas abiertas de una mesa.
  async byMesa(mesaId: number, user: any) {
    const comandas = await this.prisma.comanda.findMany({
      where: {
        mesaId,
        companyId: user.companyId,
        status: { notIn: ['COBRADA', 'CANCELADA'] },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        items: true,
        user: { select: { id: true, name: true } },
      },
    });
    return { success: true, data: comandas };
  }

  async setStatus(id: number, status: string, user: any) {
    const comanda = await this.prisma.comanda.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!comanda) throw new NotFoundException('Comanda no encontrada');

    const updated = await this.prisma.comanda.update({
      where: { id },
      data: { status },
    });

    // Al cancelar, si la mesa no tiene otras comandas abiertas, se libera.
    if (status === 'CANCELADA' && comanda.mesaId) {
      const others = await this.prisma.comanda.count({
        where: {
          mesaId: comanda.mesaId,
          status: { notIn: ['COBRADA', 'CANCELADA'] },
        },
      });
      if (others === 0) {
        await this.prisma.mesa.update({
          where: { id: comanda.mesaId },
          data: { status: 'LIBRE' },
        });
      }
    }

    return { success: true, data: updated };
  }

  // Cobrar: genera la venta a partir de la comanda y libera la mesa.
  async charge(id: number, dto: any, user: any) {
    const comanda = await this.prisma.comanda.findFirst({
      where: { id, companyId: user.companyId },
      include: { items: true },
    });
    if (!comanda) throw new NotFoundException('Comanda no encontrada');
    if (comanda.status === 'COBRADA') {
      throw new BadRequestException('La comanda ya fue cobrada');
    }

    let customerId = dto.customerId ? Number(dto.customerId) : null;
    if (!customerId) {
      const cf = await this.prisma.customer.findFirst({
        where: { companyId: user.companyId, document: '222222222222' },
        select: { id: true },
      });
      customerId = cf?.id ?? null;
    }

    const sale = await this.prisma.sale.create({
      data: {
        code: `SALE-${Date.now()}`,
        totalAmount: comanda.total,
        paymentMethod: dto.paymentMethod || 'EFECTIVO',
        paymentStatus: 'PAGADA',
        saleStatus: 'NUEVA',
        saleDate: new Date(),
        customerId,
        localId: comanda.localId,
        userId: comanda.userId ?? user.id,
        items: {
          create: comanda.items.map((it) => ({
            inventoryVariantId: it.inventoryVariantId,
            serviceId: it.serviceId,
            quantity: it.quantity,
            price: it.price,
            subtotal: it.subtotal,
            discount: 0,
          })),
        },
      },
    });

    await this.prisma.comanda.update({
      where: { id },
      data: { status: 'COBRADA', saleId: sale.id },
    });

    if (comanda.mesaId) {
      const others = await this.prisma.comanda.count({
        where: {
          mesaId: comanda.mesaId,
          status: { notIn: ['COBRADA', 'CANCELADA'] },
        },
      });
      if (others === 0) {
        await this.prisma.mesa.update({
          where: { id: comanda.mesaId },
          data: { status: 'LIBRE' },
        });
      }
    }

    return { success: true, data: { saleId: sale.id } };
  }
}
