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
import { PaymentMethod, PaymentStatus, Status } from '@prisma/client';
import { StockService } from '@/inventory/stock.service';
import {
  formatLocalDate,
  getDayRange,
  getRangeDates,
} from '@/common/date-range.util';
import { applyLocalFilter } from '@/common/local-filter.util';
import { AuditService } from '@/audit/audit.service';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private stockService: StockService,
    private audit: AuditService,
  ) {}

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

    return {
      success: true,
      data: items.map((s) => ({ ...s, lastAudit: auditMap[s.id] || null })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
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

    if (!dto.customerId || !dto.localId || !dto.paymentMethod) {
      throw new BadRequestException('Faltan datos obligatorios');
    }

    const local = await this.prisma.local.findFirst({
      where: {
        id: dto.localId,
        companyId: user.companyId,
      },
    });

    if (!local) {
      throw new ForbiddenException('Local no pertenece a tu empresa');
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

    return this.prisma.$transaction(async (tx) => {
      let total = 0;

      const itemsData: {
        inventoryVariantId: number | null;
        serviceId: number | null;
        quantity: number;
        price: number;
        discount: number;
        subtotal: number;
      }[] = [];

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

          await this.stockService.decrement(variant.id, item.quantity, tx);

          itemsData.push({
            inventoryVariantId: variant.id,
            serviceId: null,
            quantity: item.quantity,
            price,
            discount,
            subtotal,
          });

          total += subtotal;
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
          const discount = item.discount ?? 0;

          const subtotal = this.calculateSubtotal(
            price,
            item.quantity,
            discount,
          );

          itemsData.push({
            inventoryVariantId: null,
            serviceId: service.id,
            quantity: item.quantity,
            price,
            discount,
            subtotal,
          });

          total += subtotal;
        }
      }

      // Guarda la fecha y hora exactas seleccionadas (o el momento actual
      // si no se envía ninguna).
      const saleDate = dto.saleDate ? new Date(dto.saleDate) : new Date();

      const sale = await tx.sale.create({
        data: {
          code: `SALE-${Date.now()}`,
          totalAmount: total,
          paymentMethod: dto.paymentMethod,
          paymentStatus: dto.paymentStatus ?? 'PAGADA',
          saleStatus: 'NUEVA',
          saleDate: saleDate,
          notes: dto.notes,
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

      const itemsData: {
        inventoryVariantId: number | null;
        serviceId: number | null;
        quantity: number;
        price: number;
        discount: number;
        subtotal: number;
      }[] = [];

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

          itemsData.push({
            inventoryVariantId: null,
            serviceId: service.id,
            quantity: item.quantity,
            price,
            discount,
            subtotal,
          });

          total += subtotal;
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

          await this.stockService.decrement(variant.id, item.quantity, tx);

          itemsData.push({
            inventoryVariantId: variant.id,
            serviceId: null,
            quantity: item.quantity,
            price,
            discount,
            subtotal,
          });

          total += subtotal;
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

      const updatedSale = await tx.sale.update({
        where: { id },

        data: {
          ...baseUpdate,

          totalAmount: total,

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

      await tx.sale.delete({ where: { id } });

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
        user: true,
        local: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Factura no encontrada');
    }

    return {
      valid: true,
      code: sale.code,
      saleDate: sale.saleDate,
      customer: sale.customer?.name || 'CONSUMIDOR FINAL',
      totalAmount: sale.totalAmount,
      items: sale.items.map((item) => ({
        product: item.variant?.inventory?.name || item.service?.name || 'ITEM',
        quantity: item.quantity,
        subtotal: item.subtotal,
      })),
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
}
