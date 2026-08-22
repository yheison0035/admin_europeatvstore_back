import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { getAccessibleLocalIds } from '@/common/access-locals.util';
import { SalesService } from '@/sales/sales.service';

const KITCHEN_STATUSES = ['PENDIENTE', 'PREPARANDO', 'LISTO'];

// Estados válidos de una comanda y a qué se puede pasar desde cada uno.
// COBRADA no se pone con setStatus: se alcanza únicamente al cobrar.
const ALL_STATUSES = [
  'PENDIENTE',
  'PREPARANDO',
  'LISTO',
  'ENTREGADO',
  'COBRADA',
  'CANCELADA',
];
const TRANSITIONS: Record<string, string[]> = {
  PENDIENTE: ['PREPARANDO', 'LISTO', 'ENTREGADO', 'CANCELADA'],
  PREPARANDO: ['LISTO', 'ENTREGADO', 'CANCELADA'],
  LISTO: ['ENTREGADO', 'CANCELADA'],
  ENTREGADO: ['CANCELADA'],
  COBRADA: [],
  CANCELADA: [],
};
// La cocina solo mueve estados de cocina.
const COCINERO_ALLOWED = ['PREPARANDO', 'LISTO'];

@Injectable()
export class ComandasService {
  constructor(
    private prisma: PrismaService,
    private salesService: SalesService,
  ) {}

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
    if (!ALL_STATUSES.includes(status)) {
      throw new BadRequestException('Estado no válido');
    }
    // COBRADA se alcanza solo al cobrar (no por cambio de estado manual).
    if (status === 'COBRADA') {
      throw new BadRequestException('Para cobrar usa la opción de cobro');
    }
    // La cocina únicamente marca "Preparando" / "Listo".
    if (user.role === 'COCINERO' && !COCINERO_ALLOWED.includes(status)) {
      throw new ForbiddenException('La cocina solo marca Preparando o Listo');
    }

    const comanda = await this.prisma.comanda.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!comanda) throw new NotFoundException('Comanda no encontrada');

    // Validar que la transición desde el estado actual esté permitida
    // (una comanda cobrada o cancelada ya no se mueve).
    const allowed = TRANSITIONS[comanda.status] ?? [];
    if (comanda.status !== status && !allowed.includes(status)) {
      throw new BadRequestException(
        `No se puede pasar de ${comanda.status} a ${status}`,
      );
    }

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

  // Cobrar una sola comanda (pedido).
  async charge(id: number, dto: any, user: any) {
    const comanda = await this.prisma.comanda.findFirst({
      where: { id, companyId: user.companyId },
      include: { items: true },
    });
    if (!comanda) throw new NotFoundException('Comanda no encontrada');
    if (comanda.status === 'COBRADA') {
      throw new BadRequestException('La comanda ya fue cobrada');
    }
    return this.chargeComandas([comanda], dto, user);
  }

  // Cobrar TODA la mesa: junta todas sus comandas abiertas en una sola venta.
  // Es lo que ve caja cuando el cliente se acerca con su mesa.
  async chargeMesa(mesaId: number, dto: any, user: any) {
    const mesa = await this.prisma.mesa.findFirst({
      where: { id: mesaId, companyId: user.companyId },
    });
    if (!mesa) throw new NotFoundException('Mesa no encontrada');

    const comandas = await this.prisma.comanda.findFirst({
      where: {
        mesaId,
        companyId: user.companyId,
        status: { notIn: ['COBRADA', 'CANCELADA'] },
      },
    });
    if (!comandas) {
      throw new BadRequestException('La mesa no tiene pedidos por cobrar');
    }

    const open = await this.prisma.comanda.findMany({
      where: {
        mesaId,
        companyId: user.companyId,
        status: { notIn: ['COBRADA', 'CANCELADA'] },
      },
      include: { items: true },
    });
    return this.chargeComandas(open, dto, user);
  }

  // Núcleo del cobro: arma una venta REAL a partir de las comandas (con la
  // misma lógica que una venta normal: transacción, descuento de stock
  // respetando trackStock, IVA, movimiento de caja y auditoría), marca las
  // comandas como COBRADA y libera la mesa si ya no le quedan pedidos abiertos.
  private async chargeComandas(comandas: any[], dto: any, user: any) {
    if (!comandas.length) {
      throw new BadRequestException('No hay pedidos por cobrar');
    }

    const localId = comandas[0].localId;

    // Ítems para la venta (un ítem por línea de comanda; el precio/impuesto lo
    // resuelve la venta con el catálogo y la config fiscal de la empresa).
    const items = comandas
      .flatMap((c) => c.items)
      .map((it) =>
        it.serviceId
          ? { serviceId: it.serviceId, quantity: it.quantity, discount: 0 }
          : {
              inventoryVariantId: it.inventoryVariantId,
              quantity: it.quantity,
              discount: 0,
            },
      )
      .filter((it) => it.inventoryVariantId || it.serviceId);

    if (!items.length) {
      throw new BadRequestException('Los pedidos no tienen ítems para cobrar');
    }

    const saleRes = await this.salesService.create(
      {
        localId,
        paymentMethod: dto.paymentMethod || 'EFECTIVO',
        customerId: dto.customerId ? Number(dto.customerId) : undefined,
        userId: user.id,
        items,
      } as any,
      user,
    );
    const sale = saleRes.data;

    const ids = comandas.map((c) => c.id);
    await this.prisma.comanda.updateMany({
      where: { id: { in: ids } },
      data: { status: 'COBRADA', saleId: sale.id },
    });

    // Liberar las mesas involucradas si ya no tienen comandas abiertas.
    const mesaIds = [
      ...new Set(comandas.map((c) => c.mesaId).filter(Boolean)),
    ] as number[];
    for (const mesaId of mesaIds) {
      const others = await this.prisma.comanda.count({
        where: {
          mesaId,
          status: { notIn: ['COBRADA', 'CANCELADA'] },
        },
      });
      if (others === 0) {
        await this.prisma.mesa.update({
          where: { id: mesaId },
          data: { status: 'LIBRE' },
        });
      }
    }

    return {
      success: true,
      data: { saleId: sale.id, total: sale.totalAmount },
    };
  }
}
