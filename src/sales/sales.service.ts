import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { CreateSaleDto, CreateSaleItemDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { getAccessibleLocalIds } from '@/common/access-locals.util';
import {
  PaymentMethod,
  PaymentStatus,
  Status,
  ShippingStatus,
  Prisma,
} from '@prisma/client';
import { StockService } from '@/inventory/stock.service';
import { PlanLimitsService } from '@/common/plan-limits.service';
import {
  formatLocalDate,
  getDayRange,
  getRangeDates,
} from '@/common/date-range.util';
import { applyLocalFilter } from '@/common/local-filter.util';
import { AuditService } from '@/audit/audit.service';
import {
  replayCustomerStamps,
  applyLoyaltyVisit,
  loyaltyStatus,
} from '@/common/loyalty.util';
import { RecipesService } from '@/recipes/recipes.service';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private stockService: StockService,
    private audit: AuditService,
    private planLimits: PlanLimitsService,
    private recipes: RecipesService,
  ) {}

  // Recalcula los sellos de fidelización de UN cliente desde todas sus ventas
  // válidas (única fuente de verdad). Se llama al crear/anular/editar una venta,
  // así el sello queda idéntico al que da "Sincronizar", anular reversa la
  // visita, y todos los módulos ven lo mismo. El Consumidor Final no acumula.
  private async recomputeLoyaltyForCustomer(
    db: Prisma.TransactionClient | PrismaService,
    companyId: number,
    customerId: number | null | undefined,
  ) {
    if (!customerId) return;

    const company = await db.company.findUnique({
      where: { id: companyId },
      select: {
        loyaltyEnabled: true,
        loyaltyTier1Visits: true,
        loyaltyTier1Percent: true,
        loyaltyTier2Visits: true,
        loyaltyTier2Percent: true,
        loyaltyMaxDays: true,
      },
    });
    if (!company?.loyaltyEnabled) return;

    const customer = await db.customer.findFirst({
      where: { id: customerId, companyId },
      select: { id: true, document: true, loyaltyManualComplete: true },
    });
    if (!customer || customer.document === '222222222222') return;

    const sales = await db.sale.findMany({
      where: {
        customerId,
        saleStatus: { notIn: ['CANCELADA', 'RECHAZADA', 'DEVUELTA'] as any },
        local: { is: { companyId } },
      },
      select: { saleDate: true },
      orderBy: { saleDate: 'asc' },
    });

    const replay = replayCustomerStamps(company as any, sales);
    // Si el dueño lo graduó a mano, se respeta: tarjeta completa, no acumula más.
    const stamps = customer.loyaltyManualComplete
      ? company.loyaltyTier2Visits
      : replay.stamps;
    const completed = customer.loyaltyManualComplete || replay.completed;
    await db.customer.update({
      where: { id: customerId },
      data: {
        loyaltyStamps: stamps,
        loyaltyLastVisit: replay.last,
        loyaltyCompleted: completed,
      },
    });
  }

  // % de descuento de fidelización que le toca a ESTA venta según los sellos
  // actuales del cliente (0 si no aplica). Se usa para garantizar el descuento
  // en los servicios aunque el POS no lo mande.
  private async loyaltyDiscountForSale(
    companyId: number,
    dto: any,
  ): Promise<number> {
    if (!dto.customerId) return 0;
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        loyaltyEnabled: true,
        loyaltyTier1Visits: true,
        loyaltyTier1Percent: true,
        loyaltyTier2Visits: true,
        loyaltyTier2Percent: true,
        loyaltyMaxDays: true,
      },
    });
    if (!company?.loyaltyEnabled) return 0;
    const customer = await this.prisma.customer.findFirst({
      where: { id: Number(dto.customerId), companyId },
      select: {
        document: true,
        loyaltyStamps: true,
        loyaltyLastVisit: true,
        loyaltyCompleted: true,
        loyaltyManualComplete: true,
      },
    });
    if (!customer || customer.document === '222222222222') return 0;
    const when = dto.saleDate ? new Date(dto.saleDate) : new Date();
    const { discount } = applyLoyaltyVisit(company as any, customer, when);
    return discount || 0;
  }

  // Fiado / crédito solo desde el plan Impulso. Se valida al crear/editar venta.
  private async assertFiadoAllowed(dto: any, user: any) {
    const usaFiado =
      dto?.paymentStatus === 'FIADO' || dto?.paymentMethod === 'CREDITO';
    if (usaFiado) {
      await this.planLimits.assertModule(user.companyId, 'fiado');
    }
  }

  // Descompone un total de línea en base gravable + IVA.
  //  - includeIva=true  : el precio YA incluye IVA → se le extrae.
  //  - includeIva=false : el IVA se suma sobre el precio.
  private taxParts(gross: number, ratePct: number, includeIva: boolean) {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const rate = ratePct > 0 ? ratePct : 0;
    if (rate === 0) return { base: r2(gross), tax: 0 };
    if (includeIva) {
      const base = r2(gross / (1 + rate / 100));
      return { base, tax: r2(gross - base) };
    }
    return { base: r2(gross), tax: r2((gross * rate) / 100) };
  }

  // Tasa de IVA que aplica a un ítem según la config fiscal de la empresa.
  private itemTaxRate(
    productRate: any,
    fiscal: { responsableIVA: boolean; defaultTaxRate: any },
  ): number {
    if (!fiscal?.responsableIVA) return 0;
    const pr = Number(productRate) || 0;
    return pr > 0 ? pr : Number(fiscal.defaultTaxRate) || 0;
  }

  private calculateSubtotal(price: number, quantity: number, discount = 0) {
    if (discount < 0) {
      throw new BadRequestException('El descuento no puede ser negativo');
    }

    const subtotal = price * quantity;

    if (discount > subtotal) {
      throw new BadRequestException(
        'El descuento no puede ser mayor al subtotal',
      );
    }

    return subtotal - discount;
  }

  private validateItem(item: CreateSaleItemDto) {
    if (
      (!item.inventoryVariantId && !item.serviceId) ||
      (item.inventoryVariantId && item.serviceId)
    ) {
      throw new BadRequestException(
        'Cada item debe ser producto o servicio, no ambos ni ninguno',
      );
    }
  }

  async findAllPaginated(user: any, query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const where: any = {};

    if (user.role !== 'SUPER_PLATFORM_ADMIN') {
      where.local = {
        is: {
          companyId: user.companyId,
        },
      };
    }

    applyLocalFilter(where, user, localIds, 'sale');

    if (query.code) {
      where.code = {
        contains: query.code,
        mode: 'insensitive',
      };
    }

    if (query.customer) {
      where.customer = {
        is: {
          OR: [
            { name: { contains: query.customer, mode: 'insensitive' } },
            { phone: { contains: query.customer, mode: 'insensitive' } },
          ],
        },
      };
    }

    if (query.userId) {
      const numericUserId = Number(query.userId);

      if (!isNaN(numericUserId)) {
        where.userId = numericUserId;
      } else {
        where.user = {
          is: {
            name: {
              contains: query.userId,
              mode: 'insensitive',
            },
          },
        };
      }
    }

    if (query.localId) {
      const v = String(query.localId).trim();
      if (/^\d+$/.test(v)) {
        where.localId = Number(v);
      } else {
        where.local = where.local || {};
        where.local.is = {
          ...(where.local.is || {}),
          name: { contains: v, mode: 'insensitive' },
        };
      }
    }

    if (query.paymentMethod) {
      where.paymentMethod = query.paymentMethod;
    }

    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }

    if (query.totalAmount) {
      const amount = Number(query.totalAmount);

      if (!isNaN(amount)) {
        where.totalAmount = amount;
      }
    }

    if (query.saleDate) {
      const raw = String(query.saleDate).trim();
      let y: number | undefined;
      let m: number | undefined;
      let d: number | undefined;

      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        [y, m, d] = raw.slice(0, 10).split('-').map(Number);
      } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
        [d, m, y] = raw.split('/').map(Number);
      }

      if (y && m && d) {
        // Rango del día en zona Colombia (UTC-5), expresado en UTC.
        const start = new Date(Date.UTC(y, m - 1, d, 5, 0, 0));
        const end = new Date(Date.UTC(y, m - 1, d + 1, 5, 0, 0));
        where.saleDate = { gte: start, lt: end };
      }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ saleDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          items: {
            include: {
              variant: {
                include: {
                  inventory: true,
                },
              },
              service: true,
            },
          },
          customer: true,
          user: true,
          local: true,
        },
      }),

      this.prisma.sale.count({ where }),
    ]);

    const auditMap = await this.audit.latestFor(
      'sale',
      items.map((s) => s.id),
      user.companyId,
    );

    // Estado de fidelización del cliente de cada venta (para el WhatsApp
    // adaptado en Ventas realizadas).
    const loyaltyCfg = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        loyaltyEnabled: true,
        loyaltyTier1Visits: true,
        loyaltyTier1Percent: true,
        loyaltyTier2Visits: true,
        loyaltyTier2Percent: true,
        loyaltyMaxDays: true,
      },
    });
    const nowL = new Date();

    return {
      success: true,
      data: items.map((s) => ({
        ...s,
        lastAudit: auditMap[s.id] || null,
        customer: s.customer
          ? { ...s.customer, loyalty: loyaltyStatus(loyaltyCfg as any, s.customer, nowL) }
          : s.customer,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Clientes por reactivar: su última visita fue hace `minDays` días o más (por
  // defecto 20; un hombre rara vez tarda tanto en volver a motilarse). Si volvió
  // antes de ese umbral, no aparece. Marca `contacted` si ya se le escribió en
  // los últimos 7 días. Ordenados del que lleva más tiempo sin volver primero.
  async getInactiveCustomers(user: any, minDays = 20, maxDays?: number) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);
    const now = Date.now();
    const cutoff = new Date(now - minDays * 86400000); // última visita <= aquí
    const oldest = maxDays ? new Date(now - maxDays * 86400000) : null;
    const WEEK = 7 * 86400000;

    // Sale no tiene companyId: se escopa por la empresa del local relacionado.
    const where: any = {
      customerId: { not: null },
      saleStatus: { notIn: ['CANCELADA', 'RECHAZADA', 'DEVUELTA'] as any },
    };
    if (user.role !== 'SUPER_PLATFORM_ADMIN') {
      where.local = { is: { companyId: user.companyId } };
    }
    applyLocalFilter(where, user, localIds, 'sale');

    const grouped = await this.prisma.sale.groupBy({
      by: ['customerId'],
      where,
      _max: { saleDate: true },
      _count: { _all: true },
    });

    // Última visita hace `minDays` días o más (y no más antigua que maxDays si se pasó).
    const candidates = grouped.filter((g) => {
      const last = g._max.saleDate;
      if (!last) return false;
      if (last > cutoff) return false;
      if (oldest && last < oldest) return false;
      return true;
    });

    if (!candidates.length) return { success: true, data: [] };

    const candidateIds = candidates.map((c) => c.customerId as number);

    const customers = await this.prisma.customer.findMany({
      where: {
        id: { in: candidateIds },
        companyId: user.companyId,
        phone: { not: null },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        document: true,
        lastWinbackAt: true,
      },
    });

    const map = new Map(customers.map((c) => [c.id, c]));

    // Último servicio realizado por cada cliente: se toma de su venta más
    // reciente (los ítems con servicio). Sirve para que la recepcionista sepa
    // qué se hizo y agende más rápido.
    const recentSales = await this.prisma.sale.findMany({
      where: { ...where, customerId: { in: candidateIds } },
      orderBy: { saleDate: 'desc' },
      select: {
        customerId: true,
        items: {
          select: {
            service: { select: { name: true } },
            variant: { select: { inventory: { select: { name: true } } } },
          },
        },
      },
    });

    // Vienen ordenadas por fecha desc: para cada cliente se guarda lo último que
    // consumió (servicio o producto) de su venta más reciente con ítems.
    const lastServiceByCustomer = new Map<number, string>();
    for (const s of recentSales) {
      if (s.customerId == null) continue;
      if (lastServiceByCustomer.has(s.customerId)) continue;
      const names = s.items
        .map((it) => it.service?.name || it.variant?.inventory?.name)
        .filter((n): n is string => !!n);
      if (names.length) {
        lastServiceByCustomer.set(s.customerId, names.slice(0, 2).join(', '));
      }
    }

    const data = candidates
      .map((c) => {
        const cust = map.get(c.customerId as number);
        if (!cust) return null;
        if (!cust.phone || cust.document === '222222222222') return null;
        const last = c._max.saleDate as Date;
        const days = Math.floor((now - last.getTime()) / 86400000);
        // "Escrito" si se le contactó dentro de la última semana.
        const contacted =
          !!cust.lastWinbackAt &&
          now - new Date(cust.lastWinbackAt).getTime() <= WEEK;
        return {
          id: cust.id,
          name: cust.name,
          phone: cust.phone,
          lastVisit: last.toISOString(),
          days,
          visits: c._count._all,
          lastService: lastServiceByCustomer.get(cust.id) || null,
          contacted,
          contactedAt: contacted
            ? new Date(cust.lastWinbackAt as Date).toISOString()
            : null,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.days - a.days);

    return { success: true, data };
  }

  // Registra que ya se le escribió al cliente (campaña de reactivación).
  async markWinbackContacted(customerId: number, user: any) {
    const cust = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId: user.companyId },
    });
    if (!cust) throw new NotFoundException('Cliente no encontrado');

    const now = new Date();
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { lastWinbackAt: now },
    });

    return { success: true, data: { id: customerId, contactedAt: now.toISOString() } };
  }

  // ============================ PEDIDOS (WEB) ============================
  // Los pedidos son ventas originadas en la tienda online (source = ECOMMERCE).
  // Se listan/gestionan aparte de las ventas de mostrador.
  async findOrders(user: any, query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    // Los pedidos web pertenecen a la tienda online de TODA la empresa (viven
    // en el local de ecommerce), no al local físico del usuario: se escopan por
    // empresa para que cualquier miembro con permiso los gestione.
    const where: any = {
      source: 'ECOMMERCE',
      local: { is: { companyId: user.companyId } },
    };

    if (query.code) {
      where.code = { contains: query.code, mode: 'insensitive' };
    }

    if (query.shippingStatus) where.shippingStatus = query.shippingStatus;
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus;

    if (query.customer) {
      where.OR = [
        {
          ecommerceCustomer: {
            is: {
              OR: [
                { firstName: { contains: query.customer, mode: 'insensitive' } },
                { lastName: { contains: query.customer, mode: 'insensitive' } },
                { phone: { contains: query.customer, mode: 'insensitive' } },
                { email: { contains: query.customer, mode: 'insensitive' } },
              ],
            },
          },
        },
        {
          customer: {
            is: {
              OR: [
                { name: { contains: query.customer, mode: 'insensitive' } },
                { phone: { contains: query.customer, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ saleDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          ecommerceCustomer: true,
          customer: true,
          shipment: true,
          local: true,
          _count: { select: { items: true } },
        },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return {
      success: true,
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOrderOne(id: number, user: any) {
    const order = await this.prisma.sale.findFirst({
      where: {
        id,
        source: 'ECOMMERCE',
        local: { is: { companyId: user.companyId } },
      },
      include: {
        items: {
          include: {
            variant: { include: { inventory: true } },
            service: true,
          },
        },
        ecommerceCustomer: true,
        customer: true,
        user: true,
        local: true,
        shipment: true,
      },
    });

    if (!order) throw new NotFoundException('Pedido no encontrado');

    return { success: true, data: order };
  }

  // Actualiza el cumplimiento del pedido: estado de envío + datos de la guía
  // (transportadora, número, fechas). Crea el Shipment si no existe.
  async updateOrderFulfillment(id: number, user: any, dto: any) {
    const order = await this.prisma.sale.findFirst({
      where: {
        id,
        source: 'ECOMMERCE',
        local: { is: { companyId: user.companyId } },
      },
      include: { shipment: true },
    });

    if (!order) throw new NotFoundException('Pedido no encontrado');

    const status: ShippingStatus | undefined =
      dto.shippingStatus && ShippingStatus[dto.shippingStatus]
        ? dto.shippingStatus
        : undefined;

    // Fechas automáticas según el estado, respetando lo que llegue explícito.
    const now = new Date();
    const shippedAt =
      dto.shippedAt !== undefined
        ? dto.shippedAt
          ? new Date(dto.shippedAt)
          : null
        : status === 'EN_CAMINO' && !order.shipment?.shippedAt
          ? now
          : undefined;
    const deliveredAt =
      dto.deliveredAt !== undefined
        ? dto.deliveredAt
          ? new Date(dto.deliveredAt)
          : null
        : status === 'ENTREGADO' && !order.shipment?.deliveredAt
          ? now
          : undefined;

    await this.prisma.$transaction(async (tx) => {
      if (status) {
        await tx.sale.update({
          where: { id },
          data: { shippingStatus: status },
        });
      }

      const shipmentData: any = {};
      if (dto.carrier !== undefined) shipmentData.carrier = dto.carrier;
      if (dto.trackingNumber !== undefined)
        shipmentData.trackingNumber = dto.trackingNumber;
      if (dto.notes !== undefined) shipmentData.notes = dto.notes;
      if (status) shipmentData.status = status;
      if (shippedAt !== undefined) shipmentData.shippedAt = shippedAt;
      if (deliveredAt !== undefined) shipmentData.deliveredAt = deliveredAt;

      if (Object.keys(shipmentData).length > 0) {
        await tx.shipment.upsert({
          where: { saleId: id },
          create: { saleId: id, ...shipmentData },
          update: shipmentData,
        });
      }
    });

    await this.audit.log({
      entity: 'sale',
      entityId: id,
      action: 'UPDATE',
      user,
      changes: { fulfillment: dto },
    });

    return this.findOrderOne(id, user);
  }

  async findOne(id: number, user: any) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            variant: {
              include: {
                inventory: true,
              },
            },
            service: true,
          },
        },
        customer: true,
        user: true,
        local: true,
        shipment: true,
        appointment: {
          include: {
            barber: true,
            service: true,
          },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    const local = await this.prisma.local.findFirst({
      where: {
        id: sale.localId,
        companyId: user.companyId,
      },
    });

    if (!local) {
      throw new ForbiddenException('No tienes acceso a esta venta');
    }

    const items = sale.items.map((item) => {
      if (item.service) {
        return {
          ...item,
          type: 'service',
          name: item.service.name,
          duration: item.service.duration,
        };
      }

      return {
        ...item,
        type: 'product',
        name: item.variant?.inventory?.name,
        color: item.variant?.color,
        sku: item.variant?.sku,
        stock: item.variant?.stock,
      };
    });

    return {
      success: true,
      data: {
        ...sale,
        items,
      },
    };
  }

  async create(dto: CreateSaleDto, user: any) {
    if (!dto.items?.length) {
      throw new BadRequestException('La venta debe tener items');
    }

    if (!dto.localId || !dto.paymentMethod) {
      throw new BadRequestException('Faltan datos obligatorios');
    }

    // Venta de mostrador: si no se eligió cliente, se asigna el "Consumidor
    // Final" de la empresa (document 222222222222).
    if (!dto.customerId) {
      const consumidorFinal = await this.prisma.customer.findFirst({
        where: { companyId: user.companyId, document: '222222222222' },
        select: { id: true },
      });
      if (consumidorFinal) dto.customerId = consumidorFinal.id;
    }

    // El fiado/crédito requiere plan Impulso o superior.
    await this.assertFiadoAllowed(dto, user);

    const local = await this.prisma.local.findFirst({
      where: {
        id: dto.localId,
        companyId: user.companyId,
      },
    });

    if (!local) {
      throw new ForbiddenException('Local no pertenece a tu empresa');
    }

    // Política "abrir el día": si la empresa lo exige, no se puede vender sin
    // una caja abierta HOY (zona Colombia) en esta sede.
    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { requireCashOpen: true },
    });
    if (company?.requireCashOpen) {
      const now = new Date();
      const col = new Date(now.getTime() - 5 * 3600 * 1000);
      const dayStart = new Date(
        Date.UTC(col.getUTCFullYear(), col.getUTCMonth(), col.getUTCDate(), 5, 0, 0),
      );
      const openToday = await this.prisma.cashRegister.findFirst({
        where: {
          localId: dto.localId,
          companyId: user.companyId,
          status: 'ABIERTA',
          openedAt: { gte: dayStart },
        },
        select: { id: true },
      });
      if (!openToday) {
        // ¿Hay una caja abierta pero de un día anterior? -> hay que cerrarla.
        const openPrev = await this.prisma.cashRegister.findFirst({
          where: {
            localId: dto.localId,
            companyId: user.companyId,
            status: 'ABIERTA',
          },
          select: { id: true },
        });
        throw new BadRequestException(
          openPrev
            ? 'El día anterior no se ha cerrado. Cierra la caja del día anterior para poder vender.'
            : 'Debes abrir el día (abrir la caja) para poder vender.',
        );
      }
    }

    const saleUser = await this.prisma.user.findFirst({
      where: {
        id: dto.userId,
        companyId: user.companyId,
      },
    });

    if (!saleUser) {
      throw new ForbiddenException('Usuario no pertenece a tu empresa');
    }

    // Configuración fiscal de la empresa (IVA).
    const fiscal = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        responsableIVA: true,
        preciosIncluyenIVA: true,
        defaultTaxRate: true,
      },
    });
    const includeIva = fiscal?.preciosIncluyenIVA ?? true;

    // Fidelización: % de descuento que le toca a ESTA visita (según los sellos
    // actuales del cliente). El backend lo GARANTIZA como mínimo en los
    // servicios, aunque el POS no lo haya mandado, para que la recompensa nunca
    // se pierda. El Consumidor Final no acumula.
    const loyaltyPct = await this.loyaltyDiscountForSale(user.companyId, dto);

    return this.prisma.$transaction(async (tx) => {
      let total = 0;
      let saleSubtotal = 0;
      let saleTax = 0;

      const itemsData: any[] = [];
      // Platos vendidos → para descontar sus insumos por receta (comida).
      const recipeConsumption: { inventoryId: number; quantity: number }[] = [];

      for (const item of dto.items) {
        this.validateItem(item);

        // =========================
        // PRODUCTO
        // =========================
        if (item.inventoryVariantId) {
          const variant = await tx.inventoryVariant.findFirst({
            where: {
              id: item.inventoryVariantId,
              inventory: {
                local: {
                  companyId: user.companyId,
                },
              },
            },
            include: { inventory: true },
          });

          if (!variant) {
            throw new NotFoundException('Producto no válido');
          }

          const price = variant.inventory.salePrice;
          const discount = item.discount ?? 0;

          const subtotal = this.calculateSubtotal(
            price,
            item.quantity,
            discount,
          );

          const rate = this.itemTaxRate(
            variant.inventory.taxRate,
            fiscal as any,
          );
          const { base, tax } = this.taxParts(subtotal, rate, includeIva);

          // Solo se descuenta stock si el producto controla inventario. Los
          // "elaborados" (platos de un menú) se venden sin descontar existencias.
          if (variant.inventory.trackStock !== false) {
            await this.stockService.decrement(variant.id, item.quantity, tx);
          }

          // Registrar para el descuento de insumos por receta (si tiene).
          recipeConsumption.push({
            inventoryId: variant.inventory.id,
            quantity: item.quantity,
          });

          itemsData.push({
            inventoryVariantId: variant.id,
            serviceId: null,
            quantity: item.quantity,
            price,
            discount,
            subtotal,
            taxRate: rate,
            taxAmount: tax,
          });

          total += includeIva ? subtotal : subtotal + tax;
          saleSubtotal += base;
          saleTax += tax;
        }

        // =========================
        // SERVICIO
        // =========================
        else if (item.serviceId) {
          const service = await tx.service.findFirst({
            where: {
              id: item.serviceId,
              companyId: user.companyId,
            },
            include: {
              serviceLocals: true,
            },
          });

          if (!service) {
            throw new NotFoundException('Servicio no válido');
          }

          const serviceLocal = service.serviceLocals.find(
            (sl) => sl.localId === dto.localId,
          );

          if (!serviceLocal) {
            throw new BadRequestException(
              'Servicio no disponible en este local',
            );
          }

          const price = serviceLocal.price;
          // Descuento de fidelización GARANTIZADO: al menos el % que le toca a
          // la visita (aunque el POS no lo haya aplicado); nunca por debajo de
          // un descuento manual mayor.
          const loyaltyDisc =
            loyaltyPct > 0
              ? Math.round((price * item.quantity * loyaltyPct) / 100)
              : 0;
          const discount = Math.max(item.discount ?? 0, loyaltyDisc);

          const subtotal = this.calculateSubtotal(
            price,
            item.quantity,
            discount,
          );

          const rate = this.itemTaxRate(service.taxRate, fiscal as any);
          const { base, tax } = this.taxParts(subtotal, rate, includeIva);

          itemsData.push({
            inventoryVariantId: null,
            serviceId: service.id,
            quantity: item.quantity,
            price,
            discount,
            subtotal,
            taxRate: rate,
            taxAmount: tax,
          });

          total += includeIva ? subtotal : subtotal + tax;
          saleSubtotal += base;
          saleTax += tax;
        }
      }

      // Guarda la fecha y hora exactas seleccionadas (o el momento actual
      // si no se envía ninguna).
      const saleDate = dto.saleDate ? new Date(dto.saleDate) : new Date();

      const r2 = (n: number) => Math.round(n * 100) / 100;
      const sale = await tx.sale.create({
        data: {
          code: `SALE-${Date.now()}`,
          totalAmount: total,
          subtotal: r2(saleSubtotal),
          taxTotal: r2(saleTax),
          paymentMethod: dto.paymentMethod,
          paymentStatus: dto.paymentStatus ?? 'PAGADA',
          saleStatus: 'NUEVA',
          saleDate: saleDate,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          notes: dto.notes,
          cashReceived:
            dto.paymentMethod === 'EFECTIVO' && dto.cashReceived
              ? Number(dto.cashReceived)
              : null,
          customerId: dto.customerId,
          localId: dto.localId,
          userId: dto.userId,
          items: { create: itemsData },
        },
        include: {
          items: {
            include: {
              variant: { include: { inventory: true } },
              service: true,
            },
          },
          customer: true,
          user: true,
          local: true,
        },
      });

      // Fidelización: en vez de sumar +1 aquí (que se descuadraba con el
      // "Sincronizar" y no se reversaba al anular), se RECALCULA el sello del
      // cliente desde TODAS sus ventas válidas (única fuente de verdad). Incluye
      // la venta recién creada (visible dentro de la transacción).
      await this.recomputeLoyaltyForCustomer(tx, user.companyId, dto.customerId);

      // Caja: si la venta es en efectivo y hay una caja abierta en el local, se
      // registra el ingreso automáticamente para que el arqueo cuadre.
      if (dto.paymentMethod === 'EFECTIVO') {
        const openReg = await tx.cashRegister.findFirst({
          where: {
            localId: dto.localId,
            companyId: user.companyId,
            status: 'ABIERTA',
          },
          select: { id: true },
        });
        if (openReg) {
          await tx.cashMovement.create({
            data: {
              cashRegisterId: openReg.id,
              type: 'INGRESO',
              amount: total,
              concept: 'Venta en efectivo',
              saleId: sale.id,
              userId: dto.userId ?? user.id,
            },
          });
        }
      }

      // Comida: descuenta los insumos de la receta de cada plato vendido
      // (no hace nada si el producto no tiene receta → no afecta otras verticales).
      await this.recipes.consume(
        tx,
        user.companyId,
        recipeConsumption,
        dto.userId ?? user.id,
      );

      await this.audit.log({
        entity: 'sale',
        entityId: sale.id,
        action: 'CREATE',
        user,
      });

      return { success: true, data: sale };
    });
  }

  async update(id: number, dto: UpdateSaleDto, user: any) {
    // El fiado/crédito requiere plan Impulso o superior.
    await this.assertFiadoAllowed(dto, user);

    const fiscal = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        responsableIVA: true,
        preciosIncluyenIVA: true,
        defaultTaxRate: true,
      },
    });
    const includeIva = fiscal?.preciosIncluyenIVA ?? true;

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: {
          items: true,
        },
      });

      if (!sale) {
        throw new NotFoundException('Venta no encontrada');
      }

      const local = await tx.local.findFirst({
        where: {
          id: sale.localId,
          companyId: user.companyId,
        },
      });

      if (!local) {
        throw new ForbiddenException('No tienes permiso para esta venta');
      }

      const baseUpdate = {
        paymentMethod: dto.paymentMethod ?? sale.paymentMethod,
        paymentStatus: dto.paymentStatus ?? sale.paymentStatus,
        saleStatus: dto.saleStatus ?? sale.saleStatus,
        notes: dto.notes ?? sale.notes,
        customerId: dto.customerId ?? sale.customerId,
        userId: dto.userId ?? sale.userId,
      };

      // ====================================
      // SOLO ACTUALIZAR CABECERA
      // ====================================

      if (!dto.items?.length) {
        const updated = await tx.sale.update({
          where: { id },
          data: baseUpdate,
        });

        const changes = this.audit.diff(sale, dto, [
          'paymentMethod',
          'paymentStatus',
          'saleStatus',
          'notes',
          'customerId',
          'userId',
        ]);
        await this.audit.log({
          entity: 'sale',
          entityId: id,
          action: 'UPDATE',
          user,
          changes,
        });

        return {
          success: true,
          data: updated,
        };
      }

      // ====================================
      // DEVOLVER STOCK ANTERIOR
      // ====================================

      for (const item of sale.items) {
        if (item.inventoryVariantId) {
          await this.stockService.increment(
            item.inventoryVariantId,
            item.quantity,
            tx,
          );
        }
      }

      // ====================================
      // ELIMINAR ITEMS ANTERIORES
      // ====================================

      await tx.saleItem.deleteMany({
        where: {
          saleId: id,
        },
      });

      let total = 0;
      let saleSubtotal = 0;
      let saleTax = 0;

      const itemsData: any[] = [];

      // ====================================
      // NUEVOS ITEMS
      // ====================================

      for (const item of dto.items) {
        this.validateItem(item);

        // ============================
        // SERVICIO
        // ============================

        if (item.serviceId) {
          const service = await tx.service.findFirst({
            where: {
              id: item.serviceId,
              companyId: user.companyId,
            },
            include: {
              serviceLocals: true,
            },
          });

          if (!service) {
            throw new NotFoundException('Servicio inválido');
          }

          const serviceLocal = service.serviceLocals.find(
            (sl) => sl.localId === sale.localId,
          );

          if (!serviceLocal) {
            throw new BadRequestException(
              'Servicio no disponible en este local',
            );
          }

          const price = serviceLocal.price;
          const discount = item.discount ?? 0;

          const subtotal = this.calculateSubtotal(
            price,
            item.quantity,
            discount,
          );

          const rate = this.itemTaxRate(service.taxRate, fiscal as any);
          const { base, tax } = this.taxParts(subtotal, rate, includeIva);

          itemsData.push({
            inventoryVariantId: null,
            serviceId: service.id,
            quantity: item.quantity,
            price,
            discount,
            subtotal,
            taxRate: rate,
            taxAmount: tax,
          });

          total += includeIva ? subtotal : subtotal + tax;
          saleSubtotal += base;
          saleTax += tax;
        }

        // ============================
        // PRODUCTO
        // ============================
        else if (item.inventoryVariantId) {
          const variant = await tx.inventoryVariant.findFirst({
            where: {
              id: item.inventoryVariantId,
              inventory: {
                local: {
                  companyId: user.companyId,
                },
              },
            },
            include: {
              inventory: true,
            },
          });

          if (!variant) {
            throw new NotFoundException('Producto inválido');
          }

          if (variant.stock < item.quantity) {
            throw new BadRequestException(
              `Stock insuficiente para ${variant.inventory.name}`,
            );
          }

          const price = variant.inventory.salePrice;
          const discount = item.discount ?? 0;

          const subtotal = this.calculateSubtotal(
            price,
            item.quantity,
            discount,
          );

          const rate = this.itemTaxRate(
            variant.inventory.taxRate,
            fiscal as any,
          );
          const { base, tax } = this.taxParts(subtotal, rate, includeIva);

          // Solo se descuenta stock si el producto controla inventario. Los
          // "elaborados" (platos de un menú) se venden sin descontar existencias.
          if (variant.inventory.trackStock !== false) {
            await this.stockService.decrement(variant.id, item.quantity, tx);
          }

          itemsData.push({
            inventoryVariantId: variant.id,
            serviceId: null,
            quantity: item.quantity,
            price,
            discount,
            subtotal,
            taxRate: rate,
            taxAmount: tax,
          });

          total += includeIva ? subtotal : subtotal + tax;
          saleSubtotal += base;
          saleTax += tax;
        }

        // ============================
        // INVALIDO
        // ============================
        else {
          throw new BadRequestException(
            'Debe enviar un producto o un servicio',
          );
        }
      }

      // ====================================
      // ACTUALIZAR VENTA
      // ====================================

      const r2 = (n: number) => Math.round(n * 100) / 100;
      const updatedSale = await tx.sale.update({
        where: { id },

        data: {
          ...baseUpdate,

          totalAmount: total,
          subtotal: r2(saleSubtotal),
          taxTotal: r2(saleTax),

          items: {
            create: itemsData,
          },
        },

        include: {
          items: {
            include: {
              variant: {
                include: {
                  inventory: true,
                },
              },
              service: true,
            },
          },

          customer: true,
          user: true,
          local: true,
        },
      });

      // Caja: re-sincroniza el ingreso automático tras editar. El importe o el
      // método de pago pueden haber cambiado, así que se borra el movimiento
      // anterior de esta venta y se recrea solo si quedó en EFECTIVO y hay una
      // caja abierta en su local. Así el arqueo cuadra siempre con la venta.
      // Solo el ingreso automático de la venta; los abonos de fiado se respetan.
      await tx.cashMovement.deleteMany({
        where: { saleId: id, concept: 'Venta en efectivo' },
      });
      if (updatedSale.paymentMethod === 'EFECTIVO') {
        const openReg = await tx.cashRegister.findFirst({
          where: {
            localId: updatedSale.localId,
            companyId: user.companyId,
            status: 'ABIERTA',
          },
          select: { id: true },
        });
        if (openReg) {
          await tx.cashMovement.create({
            data: {
              cashRegisterId: openReg.id,
              type: 'INGRESO',
              amount: updatedSale.totalAmount,
              concept: 'Venta en efectivo',
              saleId: id,
              userId: updatedSale.userId ?? user.id,
            },
          });
        }
      }

      // Recalcular fidelización de los clientes afectados (p.ej. si se anuló la
      // venta o se cambió el cliente): el sello se ajusta solo.
      const affected = new Set<number>();
      if (sale.customerId) affected.add(sale.customerId);
      if (updatedSale.customerId) affected.add(updatedSale.customerId);
      for (const cid of affected) {
        await this.recomputeLoyaltyForCustomer(tx, user.companyId, cid);
      }

      const changes = this.audit.diff(sale, dto, [
        'paymentMethod',
        'paymentStatus',
        'saleStatus',
        'notes',
        'customerId',
        'userId',
      ]);
      await this.audit.log({
        entity: 'sale',
        entityId: id,
        action: 'UPDATE',
        user,
        changes,
      });

      return {
        success: true,
        data: updatedSale,
      };
    });
  }

  async remove(id: number, user: any) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!sale) throw new NotFoundException('Venta no encontrada');

    const local = await this.prisma.local.findFirst({
      where: {
        id: sale.localId,
        companyId: user.companyId,
      },
    });

    if (!local) throw new ForbiddenException('No tienes permiso');

    return this.prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        if (item.inventoryVariantId) {
          await this.stockService.increment(
            item.inventoryVariantId,
            item.quantity,
            tx,
          );
        }
      }

      // Caja: elimina el ingreso automático de esta venta para que el arqueo
      // baje al instante (la relación es SetNull, así que sin esto quedaría un
      // movimiento huérfano sumando de más).
      await tx.cashMovement.deleteMany({ where: { saleId: id } });

      await tx.sale.delete({ where: { id } });

      // Reversa la visita de fidelización: se recalcula el sello del cliente
      // desde sus ventas restantes (la venta anulada ya no cuenta).
      await this.recomputeLoyaltyForCustomer(tx, user.companyId, sale.customerId);

      await this.audit.log({
        entity: 'sale',
        entityId: id,
        action: 'DELETE',
        user,
      });

      return {
        success: true,
        message: 'Venta eliminada y stock restaurado',
      };
    });
  }

  // Verificar validez de una venta por código
  async verifySale(code: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { code },
      include: {
        items: {
          include: {
            variant: { include: { inventory: true } },
            service: true,
          },
        },
        customer: true,
        user: { select: { name: true } },
        local: {
          include: {
            company: {
              select: {
                name: true,
                logo: true,
                nit: true,
                phone: true,
                email: true,
                businessName: true,
                responsableIVA: true,
              },
            },
          },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException('Factura no encontrada');
    }

    const placeholders = ['ÚNICO', 'UNICO', 'GENERAL'];
    const items = sale.items.map((item) => {
      const color = item.variant?.color;
      return {
        name: item.variant?.inventory?.name || item.service?.name || 'ÍTEM',
        color:
          color && !placeholders.includes(color.toUpperCase()) ? color : null,
        quantity: item.quantity,
        price: item.price,
        discount: item.discount,
        subtotal: item.subtotal,
        taxRate: Number(item.taxRate) || 0,
        taxAmount: Number(item.taxAmount) || 0,
      };
    });

    const subtotal = items.reduce((a, i) => a + i.price * i.quantity, 0);
    const discount = items.reduce((a, i) => a + (i.discount || 0), 0);
    const taxTotal = Number(sale.taxTotal) || 0;
    const taxable = sale.subtotal != null ? Number(sale.subtotal) : null;

    return {
      valid: true,
      code: sale.code,
      saleDate: sale.saleDate,
      paymentMethod: sale.paymentMethod,
      paymentStatus: sale.paymentStatus,
      notes: sale.notes || null,
      subtotal,
      discount,
      // Desglose fiscal: base gravable + IVA (0 si la empresa no cobra IVA).
      taxable,
      taxTotal,
      responsableIVA: !!sale.local?.company?.responsableIVA,
      totalAmount: sale.totalAmount,
      customer: {
        name: sale.customer?.name || 'CONSUMIDOR FINAL',
        document: sale.customer?.document || null,
      },
      seller: sale.user?.name || null,
      local: {
        name: sale.local?.name || null,
        address: sale.local?.address || null,
        city: sale.local?.city || null,
        phone: sale.local?.phone || null,
      },
      company: {
        name: sale.local?.company?.name || null,
        businessName: sale.local?.company?.businessName || null,
        logo: sale.local?.company?.logo || null,
        nit: sale.local?.company?.nit || null,
        phone: sale.local?.company?.phone || null,
        email: sale.local?.company?.email || null,
      },
      items,
    };
  }

  // Reportes por dia
  async dailySalesReport(dto: any, user: any) {
    const { date, localId } = dto;

    const local = await this.prisma.local.findFirst({
      where: {
        id: Number(localId),
        companyId: user.companyId,
      },
    });

    if (!local) {
      throw new ForbiddenException('No tienes permiso');
    }

    const { start, end } = getDayRange(date);

    const sales = await this.prisma.sale.findMany({
      where: {
        localId: Number(localId),
        saleDate: {
          gte: start,
          lte: end,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        saleDate: 'asc',
      },
    });

    let totalGeneral = 0;

    const usersMap: Record<string, number> = {};

    const methodsMap: Record<
      string,
      {
        total: number;
        users: Record<string, number>;
      }
    > = {};

    for (const sale of sales) {
      const amount = Number(sale.totalAmount);

      const userName = sale.user?.name || 'SIN ASESOR';

      const method = sale.paymentMethod || 'OTROS';

      totalGeneral += amount;

      usersMap[userName] = (usersMap[userName] || 0) + amount;

      if (!methodsMap[method]) {
        methodsMap[method] = {
          total: 0,
          users: {},
        };
      }

      methodsMap[method].total += amount;

      methodsMap[method].users[userName] =
        (methodsMap[method].users[userName] || 0) + amount;
    }

    const usersSorted = Object.entries(usersMap)
      .map(([name, total]) => ({
        name,
        total,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      success: true,
      data: {
        date,
        localId,
        total: {
          total: totalGeneral,
          users: usersSorted,
        },
        methods: methodsMap,
      },
    };
  }

  // Reporte por rango de fechas
  async rangeSalesReport(dto: any, user: any) {
    const { startDate, endDate, localId, userId } = dto;

    if (!startDate || !endDate) {
      throw new BadRequestException('Fechas requeridas');
    }

    const local = await this.prisma.local.findFirst({
      where: {
        id: Number(localId),
        companyId: user.companyId,
      },
    });

    if (!local) {
      throw new ForbiddenException('No tienes permiso');
    }

    const { start, end } = getRangeDates(startDate, endDate);

    const sales = await this.prisma.sale.findMany({
      where: {
        localId: Number(localId),
        // El asesor es opcional: si no se indica, se agregan las ventas de
        // todos los vendedores del rango (reporte semanal completo).
        ...(userId ? { userId: Number(userId) } : {}),
        saleDate: {
          gte: start,
          lte: end,
        },
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    let totalGeneral = 0;

    const usersMap: Record<string, number> = {};
    const methodsMap: Record<string, { total: number }> = {};
    const dailyMap: Record<string, number> = {};

    for (const sale of sales) {
      const amount = sale.totalAmount;
      const userName = sale.user?.name || 'SIN ASESOR';
      const method = sale.paymentMethod || 'OTROS';

      totalGeneral += amount;

      usersMap[userName] = (usersMap[userName] || 0) + amount;

      if (!methodsMap[method]) {
        methodsMap[method] = { total: 0 };
      }

      methodsMap[method].total += amount;

      const dateKey = formatLocalDate(sale.saleDate);

      dailyMap[dateKey] = (dailyMap[dateKey] || 0) + amount;
    }

    const daily: { date: string; total: number }[] = [];

    let current = new Date(`${startDate}T00:00:00-05:00`);
    const last = new Date(`${endDate}T00:00:00-05:00`);

    while (current <= last) {
      const dateKey = formatLocalDate(current);

      daily.push({
        date: dateKey,
        total: dailyMap[dateKey] || 0,
      });

      current.setDate(current.getDate() + 1);
    }

    return {
      success: true,
      data: {
        startDate,
        endDate,
        localId,
        userId,
        total: {
          total: totalGeneral,
          users: usersMap,
        },
        methods: methodsMap,
        daily,
      },
    };
  }

  // Reporte general por rango de fechas (sin filtrar por usuario)
  async rangeSalesGeneralReport(dto: any, user: any) {
    const { startDate, endDate, localId } = dto;

    if (!startDate || !endDate) {
      throw new BadRequestException('Fechas requeridas');
    }

    const local = await this.prisma.local.findFirst({
      where: {
        id: Number(localId),
        companyId: user.companyId,
      },
    });

    if (!local) {
      throw new ForbiddenException('No tienes permiso');
    }

    const { start, end } = getRangeDates(startDate, endDate);

    const sales = await this.prisma.sale.findMany({
      where: {
        localId: Number(localId),
        saleDate: {
          gte: start,
          lte: end,
        },
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    let totalGeneral = 0;

    const usersMap: Record<string, number> = {};
    const methodsMap: Record<string, { total: number }> = {};
    const dailyMap: Record<string, number> = {};

    for (const sale of sales) {
      const amount = sale.totalAmount;
      const userName = sale.user?.name || 'SIN ASESOR';
      const method = sale.paymentMethod || 'OTROS';

      totalGeneral += amount;

      usersMap[userName] = (usersMap[userName] || 0) + amount;

      if (!methodsMap[method]) {
        methodsMap[method] = { total: 0 };
      }
      methodsMap[method].total += amount;

      const dateKey = formatLocalDate(sale.saleDate);

      dailyMap[dateKey] = (dailyMap[dateKey] || 0) + amount;
    }

    const daily: { date: string; total: number }[] = [];

    let current = new Date(`${startDate}T00:00:00-05:00`);
    const last = new Date(`${endDate}T00:00:00-05:00`);

    while (current <= last) {
      const dateKey = formatLocalDate(current);

      daily.push({
        date: dateKey,
        total: dailyMap[dateKey] || 0,
      });

      current.setDate(current.getDate() + 1);
    }

    const usersSorted = Object.entries(usersMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

    return {
      success: true,
      data: {
        startDate,
        endDate,
        localId,
        total: {
          total: totalGeneral,
          users: usersSorted,
        },
        methods: methodsMap,
        daily,
      },
    };
  }

  // Reporte de desempeño por servicio
  async servicePerformanceReport(dto: any, user: any) {
    const { startDate, endDate, localId } = dto;

    if (!startDate || !endDate || !localId) {
      throw new BadRequestException('Fechas y local requeridos');
    }

    const local = await this.prisma.local.findFirst({
      where: {
        id: Number(localId),
        companyId: user.companyId,
      },
    });

    if (!local) {
      throw new ForbiddenException('No tienes permiso sobre este local');
    }

    const { start, end } = getRangeDates(startDate, endDate);

    const sales = await this.prisma.sale.findMany({
      where: {
        localId: Number(localId),
        saleDate: {
          gte: start,
          lte: end,
        },
      },
      include: {
        user: { select: { id: true, name: true } },
        items: {
          include: {
            service: true,
            variant: {
              include: { inventory: true },
            },
          },
        },
      },
    });

    const usersMap: any = {};

    let globalTotal = 0;
    const paymentTotals: Record<string, number> = {};

    // Comisión de barberos: 40% hasta el sábado 25/07/2026 y 45% desde el
    // domingo 26/07/2026 (00:00 hora Colombia = 05:00 UTC).
    const RATE_OLD = 0.4;
    const RATE_NEW = 0.45;
    const RATE_CHANGE = new Date('2026-07-26T05:00:00Z');

    for (const sale of sales) {
      const userName = sale.user?.name || 'SIN USUARIO';

      if (!usersMap[userName]) {
        usersMap[userName] = {
          services: {},
          products: {},
          totals: {
            servicesTotal: 0,
            productsTotal: 0,
            total: 0,
            commission: 0,
          },
        };
      }

      for (const item of sale.items) {
        // ======================
        // SERVICIOS
        // ======================
        if (item.serviceId && item.service) {
          const name = item.service.name;

          if (!usersMap[userName].services[name]) {
            usersMap[userName].services[name] = {
              price: item.price,
              count: 0,
              total: 0,
              commission: 0,
            };
          }

          usersMap[userName].services[name].count += item.quantity;
          usersMap[userName].services[name].total += item.subtotal;

          const rate = sale.saleDate >= RATE_CHANGE ? RATE_NEW : RATE_OLD;
          const commission = item.subtotal * rate;

          usersMap[userName].services[name].commission += commission;

          usersMap[userName].totals.servicesTotal += item.subtotal;
          usersMap[userName].totals.commission += commission;
        }

        // ======================
        // PRODUCTOS
        // ======================
        if (item.inventoryVariantId && item.variant) {
          const name = item.variant.inventory.name;

          if (!usersMap[userName].products[name]) {
            usersMap[userName].products[name] = {
              count: 0,
              total: 0,
            };
          }

          usersMap[userName].products[name].count += item.quantity;
          usersMap[userName].products[name].total += item.subtotal;

          usersMap[userName].totals.productsTotal += item.subtotal;
        }

        usersMap[userName].totals.total += item.subtotal;
        globalTotal += item.subtotal;

        const method = sale.paymentMethod || 'SIN_METODO';
        paymentTotals[method] = (paymentTotals[method] || 0) + item.subtotal;
      }
    }

    // Desglose por cada método de pago, omitiendo los que sean cero.
    const paymentBreakdown: Record<string, number> = {};
    for (const [method, amount] of Object.entries(paymentTotals)) {
      if (amount > 0) {
        paymentBreakdown[method] = amount;
      }
    }

    return {
      success: true,
      globalTotal,
      commissionRate: RATE_NEW,
      previousCommissionRate: RATE_OLD,
      commissionRateChangeDate: '2026-07-26',
      paymentBreakdown,
      data: usersMap,
    };
  }

  // ============================ CARTERA / FIADO ============================

  // Registra un abono (pago parcial) contra una venta a crédito. Si con el abono
  // se salda la venta, la marca PAGADA. Si el abono es en efectivo y hay caja
  // abierta en la sede, lo suma a la caja para que el arqueo cuadre.
  async addPayment(saleId: number, dto: any, user: any) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        local: { select: { companyId: true } },
        payments: { select: { amount: true } },
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.local.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes permiso');
    }
    if (['CANCELADA', 'RECHAZADA', 'DEVUELTA'].includes(sale.saleStatus as any)) {
      throw new BadRequestException('La venta no admite abonos');
    }

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const total = Number(sale.totalAmount) || 0;
    const paid = sale.payments.reduce((a, p) => a + Number(p.amount), 0);
    const saldo = r2(total - paid);
    if (saldo <= 0) throw new BadRequestException('La venta ya está pagada');

    const amount = r2(Number(dto.amount));
    if (!amount || amount <= 0) {
      throw new BadRequestException('El abono debe ser mayor a 0');
    }
    if (amount > saldo + 0.5) {
      throw new BadRequestException(
        `El abono supera el saldo pendiente ($${saldo}).`,
      );
    }

    const method: PaymentMethod = dto.method || 'EFECTIVO';
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.salePayment.create({
        data: {
          saleId,
          companyId: user.companyId,
          amount,
          method,
          note: dto.note || null,
          paidAt,
          createdById: user.id ?? null,
        },
      });

      const newPaid = r2(paid + amount);
      const settled = newPaid >= total - 0.01;
      if (settled && sale.paymentStatus !== 'PAGADA') {
        await tx.sale.update({
          where: { id: saleId },
          data: { paymentStatus: 'PAGADA' },
        });
      }

      // Caja: el efectivo del abono entra a la caja abierta de la sede.
      if (method === 'EFECTIVO') {
        const openReg = await tx.cashRegister.findFirst({
          where: {
            localId: sale.localId,
            companyId: user.companyId,
            status: 'ABIERTA',
          },
          select: { id: true },
        });
        if (openReg) {
          await tx.cashMovement.create({
            data: {
              cashRegisterId: openReg.id,
              type: 'INGRESO',
              amount,
              concept: 'Abono venta fiada',
              saleId,
              userId: user.id ?? null,
            },
          });
        }
      }

      await this.audit.log({
        entity: 'sale',
        entityId: saleId,
        action: 'UPDATE',
        user,
        changes: { abono: { before: null, after: amount } },
      });

      return {
        success: true,
        data: {
          payment,
          saldo: r2(saldo - amount),
          pagada: settled,
        },
      };
    });
  }

  // Lista los abonos de una venta + su saldo.
  async getPayments(saleId: number, user: any) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        local: { select: { companyId: true } },
        payments: {
          orderBy: { paidAt: 'desc' },
          include: { createdBy: { select: { name: true } } },
        },
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    if (sale.local.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes permiso');
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const total = Number(sale.totalAmount) || 0;
    const paid = sale.payments.reduce((a, p) => a + Number(p.amount), 0);
    return {
      success: true,
      data: {
        total,
        paid: r2(paid),
        saldo: r2(total - paid),
        dueDate: sale.dueDate,
        payments: sale.payments,
      },
    };
  }

  // Cartera: ventas a crédito con saldo pendiente. Opcional por cliente.
  async getReceivables(user: any, query: any) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);
    const where: any = { paymentStatus: 'FIADO' };
    if (user.role !== 'SUPER_PLATFORM_ADMIN') {
      where.local = { is: { companyId: user.companyId } };
    }
    applyLocalFilter(where, user, localIds, 'sale');
    if (query.customerId) where.customerId = Number(query.customerId);

    const sales = await this.prisma.sale.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { saleDate: 'asc' }],
      include: {
        customer: { select: { id: true, name: true, phone: true, document: true } },
        payments: { select: { amount: true } },
      },
    });

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const now = Date.now();
    const rows = sales
      .map((s) => {
        const total = Number(s.totalAmount) || 0;
        const paid = s.payments.reduce((a, p) => a + Number(p.amount), 0);
        const saldo = r2(total - paid);
        const ref = s.dueDate ? new Date(s.dueDate).getTime() : null;
        const overdueDays = ref ? Math.floor((now - ref) / 86400000) : null;
        return {
          id: s.id,
          code: s.code,
          saleDate: s.saleDate,
          dueDate: s.dueDate,
          overdueDays: overdueDays && overdueDays > 0 ? overdueDays : 0,
          total,
          paid: r2(paid),
          saldo,
          customer: s.customer,
        };
      })
      .filter((r) => r.saldo > 0.01);

    const totalSaldo = r2(rows.reduce((a, r) => a + r.saldo, 0));
    return { success: true, data: { totalSaldo, count: rows.length, rows } };
  }

  // Historial de TODOS los créditos (ventas a crédito) de la empresa, estén
  // activos (con saldo) o ya pagados. Se identifican por paymentMethod=CREDITO,
  // que se conserva aunque la venta ya se haya saldado.
  async getCreditsHistory(user: any, query: any) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);
    const where: any = { paymentMethod: 'CREDITO' };
    if (user.role !== 'SUPER_PLATFORM_ADMIN') {
      where.local = { is: { companyId: user.companyId } };
    }
    applyLocalFilter(where, user, localIds, 'sale');
    if (query.customerId) where.customerId = Number(query.customerId);

    const sales = await this.prisma.sale.findMany({
      where,
      orderBy: [{ saleDate: 'desc' }],
      include: {
        customer: {
          select: { id: true, name: true, phone: true, document: true },
        },
        payments: { select: { amount: true } },
      },
    });

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const now = Date.now();
    const rows = sales.map((s) => {
      const total = Number(s.totalAmount) || 0;
      const paid = s.payments.reduce((a, p) => a + Number(p.amount), 0);
      const saldo = r2(total - paid);
      const pagada = s.paymentStatus === 'PAGADA' || saldo <= 0.01;
      const ref = s.dueDate ? new Date(s.dueDate).getTime() : null;
      const od = !pagada && ref ? Math.floor((now - ref) / 86400000) : 0;
      return {
        id: s.id,
        code: s.code,
        saleDate: s.saleDate,
        dueDate: s.dueDate,
        overdueDays: od > 0 ? od : 0,
        total,
        paid: r2(paid),
        saldo: pagada ? 0 : saldo,
        status: pagada ? 'PAGADA' : 'FIADO',
        customer: s.customer,
      };
    });

    const pendiente = r2(
      rows.filter((r) => r.status === 'FIADO').reduce((a, r) => a + r.saldo, 0),
    );
    const cobrado = r2(rows.reduce((a, r) => a + r.paid, 0));
    return {
      success: true,
      data: { count: rows.length, pendiente, cobrado, rows },
    };
  }

  // Historial de abonos (movimientos de cartera) de la empresa. Persiste aunque
  // la venta ya esté saldada, para tener trazabilidad de lo cobrado.
  async getPaymentsHistory(user: any, query: any) {
    const limit = Math.min(Number(query.limit) || 100, 300);
    const where: any = { companyId: user.companyId };
    if (query.customerId) {
      where.sale = { is: { customerId: Number(query.customerId) } };
    }

    const payments = await this.prisma.salePayment.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      take: limit,
      include: {
        createdBy: { select: { name: true } },
        sale: {
          select: {
            id: true,
            code: true,
            customer: { select: { name: true } },
          },
        },
      },
    });

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const total = r2(payments.reduce((a, p) => a + Number(p.amount), 0));
    return {
      success: true,
      data: {
        total,
        count: payments.length,
        rows: payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          method: p.method,
          note: p.note,
          paidAt: p.paidAt,
          saleId: p.saleId,
          code: p.sale?.code,
          customer: p.sale?.customer?.name || 'Consumidor final',
          registeredBy: p.createdBy?.name || null,
        })),
      },
    };
  }
}
