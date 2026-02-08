import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { getAccessibleLocalIds } from 'src/common/access-locals.util';
import { DailySalesReportDto } from './dto/reports/daily/daily-sales-report.dto';
import { PaymentMethod, PaymentStatus, Status } from '@prisma/client';
import { RangeSalesReportDto } from './dto/reports/range/range-sales-report.dto';
import { StockService } from 'src/inventory/stock.service';
import { formatYMD } from 'src/utils/format';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private stockService: StockService,
  ) {}

  async findAllPaginated(user: any, query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const where: any = {};

    if (localIds !== null) {
      if (localIds.length === 0) {
        where.localId = -1;
      } else {
        where.localId = { in: localIds };
      }
    }

    if (query.code) {
      where.code = {
        contains: query.code,
        mode: 'insensitive',
      };
    }

    if (query.customer) {
      where.customer = {
        name: { contains: query.customer, mode: 'insensitive' },
      };
    }

    if (query.paymentMethod) {
      const normalizedPaymentMethod = query.paymentMethod.toUpperCase();

      if (
        Object.values(PaymentMethod).includes(
          normalizedPaymentMethod as PaymentMethod,
        )
      ) {
        where.paymentMethod = normalizedPaymentMethod as PaymentMethod;
      }
    }

    if (query.paymentStatus) {
      const normalizedPaymentStatus = query.paymentStatus.toUpperCase();

      if (
        Object.values(PaymentStatus).includes(
          normalizedPaymentStatus as PaymentStatus,
        )
      ) {
        where.paymentStatus = normalizedPaymentStatus as PaymentStatus;
      }
    }

    if (query.localId) {
      where.local = {
        name: { contains: query.localId, mode: 'insensitive' },
      };
    }

    if (query.userId) {
      where.user = {
        name: { contains: query.userId, mode: 'insensitive' },
      };
    }

    if (query.saleDate) {
      const [day, month, year] = query.saleDate.split('/').map(Number);

      if (day && month && year) {
        const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
        const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

        where.saleDate = {
          gte: startOfDay,
          lte: endOfDay,
        };
      }
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
              variant: {
                include: { inventory: true },
              },
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

    const localIds = await getAccessibleLocalIds(this.prisma, user);
    if (localIds !== null && !localIds.includes(sale.localId)) {
      throw new ForbiddenException('No tienes permiso para ver esta venta');
    }

    return { success: true, data: sale };
  }

  async create(dto: CreateSaleDto, user: any) {
    if (!dto.items?.length) {
      throw new BadRequestException('La venta debe tener productos');
    }

    if (!dto.customerId || !dto.localId || !dto.paymentMethod) {
      throw new BadRequestException('Faltan datos obligatorios');
    }

    return this.prisma.$transaction(async (tx) => {
      let total = 0;

      const itemsData: {
        inventoryVariantId: number;
        quantity: number;
        price: number;
        discount: number;
        subtotal: number;
      }[] = [];

      for (const item of dto.items) {
        const variant = await tx.inventoryVariant.findUnique({
          where: { id: item.inventoryVariantId },
          include: { inventory: true },
        });

        if (!variant) {
          throw new NotFoundException('Variante no encontrada');
        }

        if (!variant.isActive) {
          throw new BadRequestException('Variante inactiva');
        }

        const price = variant.inventory.salePrice;
        const discount = item.discount ?? 0;

        const gross = price * item.quantity;

        if (discount > gross) {
          throw new BadRequestException(
            'El descuento no puede ser mayor al valor del producto',
          );
        }

        const subtotal = Math.max(gross - discount, 0);

        // Descontar stock centralizado
        await this.stockService.decrement(variant.id, item.quantity, tx);

        itemsData.push({
          inventoryVariantId: variant.id,
          quantity: item.quantity,
          price,
          discount,
          subtotal,
        });

        total += subtotal;
      }

      const sale = await tx.sale.create({
        data: {
          code: `SALE-${Date.now()}`,
          totalAmount: total,
          paymentMethod: dto.paymentMethod,
          paymentStatus: dto.paymentStatus ?? 'PAGADA',
          saleStatus: 'NUEVA',
          saleDate: dto.saleDate ? new Date(dto.saleDate) : undefined,
          notes: dto.notes,
          customerId: dto.customerId,
          localId: dto.localId,
          userId: dto.userId,
          items: {
            create: itemsData,
          },
        },
        include: {
          items: {
            include: {
              variant: {
                include: { inventory: true },
              },
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

      const localIds = await getAccessibleLocalIds(this.prisma, user);
      if (localIds !== null && !localIds.includes(sale.localId)) {
        throw new ForbiddenException('No tienes permiso');
      }

      const baseUpdate = {
        paymentMethod: dto.paymentMethod ?? sale.paymentMethod,
        paymentStatus: dto.paymentStatus ?? sale.paymentStatus,
        saleStatus: dto.saleStatus ?? sale.saleStatus,
        saleDate: dto.saleDate ? new Date(dto.saleDate) : sale.saleDate,
        notes: dto.notes ?? sale.notes,
        customerId: dto.customerId ?? sale.customerId,
        localId: dto.localId ?? sale.localId,
        userId: dto.userId ?? sale.userId,
      };

      if (!dto.items?.length) {
        const updated = await tx.sale.update({
          where: { id },
          data: baseUpdate,
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

        return { success: true, data: updated };
      }

      // DEVOLVER STOCK ANTERIOR
      for (const item of sale.items) {
        await this.stockService.increment(
          item.inventoryVariantId,
          item.quantity,
          tx,
        );
      }

      await tx.saleItem.deleteMany({ where: { saleId: id } });

      let total = 0;
      const itemsData: {
        inventoryVariantId: number;
        quantity: number;
        price: number;
        discount: number;
        subtotal: number;
      }[] = [];

      for (const item of dto.items) {
        const variant = await tx.inventoryVariant.findUnique({
          where: { id: item.inventoryVariantId },
          include: { inventory: true },
        });

        if (!variant) throw new NotFoundException('Variante no encontrada');

        const price = variant.inventory.salePrice;
        const discount = item.discount ?? 0;

        const gross = price * item.quantity;

        if (discount > gross) {
          throw new BadRequestException(
            'El descuento no puede ser mayor al valor del producto',
          );
        }

        const subtotal = Math.max(gross - discount, 0);

        await this.stockService.decrement(variant.id, item.quantity, tx);

        itemsData.push({
          inventoryVariantId: variant.id,
          quantity: item.quantity,
          price,
          discount,
          subtotal,
        });

        total += subtotal;
      }

      const updatedSale = await tx.sale.update({
        where: { id },
        data: {
          ...baseUpdate,
          totalAmount: total,
          items: { create: itemsData },
        },
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

      return { success: true, data: updatedSale };
    });
  }

  async remove(id: number, user: any) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!sale) throw new NotFoundException('Venta no encontrada');

    const localIds = await getAccessibleLocalIds(this.prisma, user);
    if (localIds !== null && !localIds.includes(sale.localId)) {
      throw new ForbiddenException('No tienes permiso');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        await this.stockService.increment(
          item.inventoryVariantId,
          item.quantity,
          tx,
        );
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
            variant: {
              include: {
                inventory: true,
              },
            },
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
      document: sale.customer?.document || '22222222',
      totalAmount: sale.totalAmount,
      paymentMethod: sale.paymentMethod || '',
      paymentStatus: sale.paymentStatus || '',
      local: sale.local?.name || '',
      user: sale.user?.name || '',
      notes: sale.notes || '',

      // AQUÍ VAN LOS PRODUCTOS COMPRADOS
      items: sale.items.map((item) => ({
        id: item.id,
        product: item.variant.inventory.name,
        color: item.variant.color,
        quantity: item.quantity,
        price: item.price,
        discount: item.discount,
        subtotal: item.subtotal,
      })),
    };
  }

  async dailySalesReport(dto: DailySalesReportDto, user: any) {
    const { date, localId } = dto;

    if (!date || !localId) {
      throw new BadRequestException('Fecha y local son obligatorios');
    }

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    if (localIds !== null && !localIds.includes(localId)) {
      throw new ForbiddenException('No tienes permiso para ver este local');
    }

    const start = new Date(`${date}T00:00:00-05:00`);
    const end = new Date(`${date}T23:59:59-05:00`);

    const sales = await this.prisma.sale.findMany({
      where: {
        localId,
        saleDate: {
          gte: start,
          lte: end,
        },
        user: {
          status: Status.ACTIVO,
        },
      },

      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    const linkedUsers = await this.prisma.user.findMany({
      where: {
        status: Status.ACTIVO,
        OR: [{ localId }, { managedLocals: { some: { id: localId } } }],
      },
      select: { id: true, name: true },
    });

    const usersMap = new Map<number, string>();

    linkedUsers.forEach((u) => {
      usersMap.set(u.id, u.name);
    });

    sales.forEach((sale) => {
      if (sale.user) {
        usersMap.set(sale.user.id, sale.user.name);
      }
    });

    const users = Array.from(usersMap.values());

    const methods: Record<string, any> = {};
    let grandTotal = 0;

    Object.values(PaymentMethod).forEach((method) => {
      methods[method] = {
        total: 0,
        users: {},
      };

      users.forEach((userName) => {
        methods[method].users[userName] = 0;
      });
    });

    for (const sale of sales) {
      const method = sale.paymentMethod;
      const userName = sale.user?.name;

      if (!userName) continue;

      methods[method].total += sale.totalAmount;
      methods[method].users[userName] += sale.totalAmount;

      grandTotal += sale.totalAmount;
    }

    const totalByUser: Record<string, number> = {};
    users.forEach((u) => (totalByUser[u] = 0));

    sales.forEach((sale) => {
      const userName = sale.user?.name;
      if (userName) {
        totalByUser[userName] += sale.totalAmount;
      }
    });

    return {
      success: true,
      message: 'Reportes de ventas',
      data: {
        date,
        localId,
        methods,
        total: {
          total: grandTotal,
          users: totalByUser,
        },
      },
    };
  }

  async rangeSalesReport(dto: RangeSalesReportDto, user: any) {
    const { startDate, endDate, localId, userId } = dto;

    if (!startDate || !endDate || !localId) {
      throw new BadRequestException(
        'Fecha inicial, fecha final y local son obligatorios',
      );
    }

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    if (localIds !== null && !localIds.includes(localId)) {
      throw new ForbiddenException('No tienes permiso para ver este local');
    }

    const startRaw = new Date(startDate);
    const endRaw = new Date(endDate);

    if (isNaN(startRaw.getTime())) {
      throw new BadRequestException('Fecha inválida en fecha inicial');
    }

    if (isNaN(endRaw.getTime())) {
      throw new BadRequestException('Fecha inválida en fecha final');
    }

    const start = new Date(startRaw);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endRaw);
    end.setHours(23, 59, 59, 999);

    const where: any = {
      localId,
      saleDate: {
        gte: start,
        lte: end,
      },
    };

    if (userId) {
      where.userId = userId;
    }

    const sales = await this.prisma.sale.findMany({
      where: {
        ...where,
        user: {
          status: Status.ACTIVO,
        },
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    let users: string[] = [];

    if (userId) {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      if (!u) {
        throw new NotFoundException('Asesor no encontrado');
      }

      users = [u.name];
    } else {
      const linkedUsers = await this.prisma.user.findMany({
        where: {
          status: Status.ACTIVO,
          OR: [{ localId }, { managedLocals: { some: { id: localId } } }],
        },
        select: { name: true },
      });

      const usersMap = new Map<string, string>();

      linkedUsers.forEach((u) => usersMap.set(u.name, u.name));
      sales.forEach((s) => {
        if (s.user) {
          usersMap.set(s.user.name, s.user.name);
        }
      });

      users = Array.from(usersMap.values());
    }

    const methods: Record<string, any> = {};
    let grandTotal = 0;

    Object.values(PaymentMethod).forEach((method) => {
      methods[method] = {
        total: 0,
        users: {},
      };

      users.forEach((userName) => {
        methods[method].users[userName] = 0;
      });
    });

    for (const sale of sales) {
      const method = sale.paymentMethod;
      const userName = sale.user?.name;

      if (!userName) continue;

      methods[method].total += sale.totalAmount;
      methods[method].users[userName] += sale.totalAmount;

      grandTotal += sale.totalAmount;
    }

    const totalByUser: Record<string, number> = {};
    users.forEach((u) => (totalByUser[u] = 0));

    sales.forEach((sale) => {
      const userName = sale.user?.name;
      if (userName) {
        totalByUser[userName] += sale.totalAmount;
      }
    });

    const dailyMap = new Map<string, number>();

    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= end) {
      const key = cursor.toISOString().split('T')[0];
      dailyMap.set(key, 0);
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const sale of sales) {
      const key = sale.saleDate.toISOString().split('T')[0];
      if (dailyMap.has(key)) {
        dailyMap.set(key, dailyMap.get(key)! + sale.totalAmount);
      }
    }

    const daily = Array.from(dailyMap.entries()).map(([date, total]) => {
      const [year, month, day] = date.split('-');
      return {
        date: `${year}-${month}-${day}`,
        total,
      };
    });

    return {
      success: true,
      message: 'Reporte de ventas por rango',
      data: {
        startDate: formatYMD(start),
        endDate: formatYMD(end),
        localId,
        userId: userId ?? null,
        daily,
        methods,
        total: {
          total: grandTotal,
          users: totalByUser,
        },
      },
    };
  }
}
