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

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private stockService: StockService,
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

    if (query.customerId) {
      where.customerId = Number(query.customerId);
    }

    if (query.userId) {
      where.userId = Number(query.userId);
    }

    if (query.localId) {
      where.localId = Number(query.localId);
    }

    if (query.paymentMethod) {
      where.paymentMethod = query.paymentMethod;
    }

    if (query.startDate && query.endDate) {
      where.saleDate = {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate),
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
      }),
      this.prisma.sale.count({ where }),
    ]);

    return {
      success: true,
      data: items,
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
            variant: { include: { inventory: true } },
          },
        },
        customer: true,
        user: true,
        local: true,
      },
    });

    if (!sale) throw new NotFoundException('Venta no encontrada');

    const local = await this.prisma.local.findFirst({
      where: {
        id: sale.localId,
        companyId: user.companyId,
      },
    });

    if (!local) {
      throw new ForbiddenException('No tienes acceso a esta venta');
    }

    return { success: true, data: sale };
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

      const date = dto.saleDate
          ? new Date(dto.saleDate)
          : new Date();
        
        const colombiaDate = new Date(
          date.toLocaleString('en-US', { timeZone: 'America/Bogota' }),
        );
        
        // dejarla a medianoche Colombia
        colombiaDate.setHours(0, 0, 0, 0);
      
      const sale = await tx.sale.create({
        data: {
          code: `SALE-${Date.now()}`,
          totalAmount: total,
          paymentMethod: dto.paymentMethod,
          paymentStatus: dto.paymentStatus ?? 'PAGADA',
          saleStatus: 'NUEVA',
          saleDate: colombiaDate,
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

      return { success: true, data: sale };
    });
  }

  async update(id: number, dto: UpdateSaleDto, user: any) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!sale) throw new NotFoundException('Venta no encontrada');

      const local = await tx.local.findFirst({
        where: {
          id: sale.localId,
          companyId: user.companyId,
        },
      });

      if (!local) throw new ForbiddenException('No tienes permiso');

      const baseUpdate = {
        paymentMethod: dto.paymentMethod ?? sale.paymentMethod,
        paymentStatus: dto.paymentStatus ?? sale.paymentStatus,
        saleStatus: dto.saleStatus ?? sale.saleStatus,
        notes: dto.notes ?? sale.notes,
      };

      if (!dto.items?.length) {
        const updated = await tx.sale.update({
          where: { id },
          data: baseUpdate,
        });

        return { success: true, data: updated };
      }

      // devolver stock
      for (const item of sale.items) {
        if (item.inventoryVariantId) {
          await this.stockService.increment(
            item.inventoryVariantId,
            item.quantity,
            tx,
          );
        }
      }

      await tx.saleItem.deleteMany({ where: { saleId: id } });

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

        // PRODUCTO
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

          if (!variant) throw new NotFoundException('Producto inválido');

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

        // SERVICIO
        else if (item.serviceId) {
          const service = await tx.service.findFirst({
            where: {
              id: item.serviceId,
              companyId: user.companyId,
            },
            include: { serviceLocals: true },
          });

          if (!service) throw new NotFoundException('Servicio inválido');

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
      }

      const updatedSale = await tx.sale.update({
        where: { id },
        data: {
          ...baseUpdate,
          totalAmount: total,
          items: { create: itemsData },
        },
      });

      return { success: true, data: updatedSale };
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

      return {
        success: true,
        message: 'Venta eliminada y stock restaurado',
      };
    });
  }

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
        userId: Number(userId),
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
        createdAt: {
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

          const commission = item.subtotal * 0.4;

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
      }
    }

    return {
      success: true,
      globalTotal,
      data: usersMap,
    };
  }
}
