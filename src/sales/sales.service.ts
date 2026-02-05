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
import { PaymentMethod } from '@prisma/client';
import { RangeSalesReportDto } from './dto/reports/range/range-sales-report.dto';
import { StockService } from 'src/inventory/stock.service';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private stockService: StockService,
  ) {}

  async findAll(user: any) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const where: any = {};
    if (localIds === null) {
      // acceso global
    } else if (localIds.length === 0) {
      where.localId = -1;
    } else {
      where.localId = { in: localIds };
    }

    const sales = await this.prisma.sale.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: sales };
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
    if (!dto.items?.length)
      throw new BadRequestException('La venta debe tener productos');

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

        if (!variant) throw new NotFoundException('Variante no encontrada');

        if (!variant.isActive)
          throw new BadRequestException('Variante inactiva');

        const price = variant.inventory.salePrice;
        const subtotal = price * item.quantity;

        // STOCK CENTRALIZADO
        await this.stockService.decrement(variant.id, item.quantity, tx);

        itemsData.push({
          inventoryVariantId: variant.id,
          quantity: item.quantity,
          price,
          discount: item.discount ?? 0,
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
        const subtotal = price * item.quantity;

        await this.stockService.decrement(variant.id, item.quantity, tx);

        itemsData.push({
          inventoryVariantId: variant.id,
          quantity: item.quantity,
          price,
          discount: item.discount ?? 0,
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

    // Zona horaria Colombia
    const start = new Date(`${date}T00:00:00-05:00`);
    const end = new Date(`${date}T23:59:59-05:00`);

    /**
     * Ventas del día
     */
    const sales = await this.prisma.sale.findMany({
      where: {
        localId,
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

    /**
     * Usuarios enlazados al local
     * - usuarios asignados
     * - managers del local
     */
    const linkedUsers = await this.prisma.user.findMany({
      where: {
        OR: [{ localId }, { managedLocals: { some: { id: localId } } }],
      },
      select: { id: true, name: true },
    });

    /**
     * Unir:
     * - usuarios enlazados
     * - usuarios que vendieron
     */
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

    /**
     * Inicializar métodos desde ENUM
     */
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

    /**
     * Acumulación de ventas
     */
    for (const sale of sales) {
      const method = sale.paymentMethod;
      const userName = sale.user?.name;

      if (!userName) continue;

      methods[method].total += sale.totalAmount;
      methods[method].users[userName] += sale.totalAmount;

      grandTotal += sale.totalAmount;
    }

    /**
     * Total general por usuario
     */
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

    /**
     * Validar acceso al local
     */
    const localIds = await getAccessibleLocalIds(this.prisma, user);

    if (localIds !== null && !localIds.includes(localId)) {
      throw new ForbiddenException('No tienes permiso para ver este local');
    }

    /**
     * Parseo robusto de fechas
     * Soporta:
     * - YYYY-MM-DD
     * - ISO completo (2026-01-10T22:53:32.270Z)
     */
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime())) {
      throw new BadRequestException('Fecha inválida en fecha inicial');
    }

    if (isNaN(end.getTime())) {
      throw new BadRequestException('Fecha inválida en fecha final');
    }

    /**
     * Filtro base de ventas
     */
    const where: any = {
      localId,
      saleDate: {
        gte: start,
        lte: end,
      },
    };

    /**
     * Filtro opcional por asesor
     */
    if (userId) {
      where.userId = userId;
    }

    /**
     * Ventas en el rango
     */
    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    /**
     * Determinar usuarios a mostrar en el reporte
     * - Si viene userId → solo ese asesor
     * - Si no → todos los asesores del local + los que vendieron
     */
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

    /**
     * Inicializar métodos de pago
     */
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

    /**
     * Acumular ventas
     */
    for (const sale of sales) {
      const method = sale.paymentMethod;
      const userName = sale.user?.name;

      if (!userName) continue;

      methods[method].total += sale.totalAmount;
      methods[method].users[userName] += sale.totalAmount;

      grandTotal += sale.totalAmount;
    }

    /**
     * Total general por usuario
     */
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
      message: 'Reporte de ventas por rango',
      data: {
        startDate,
        endDate,
        localId,
        userId: userId ?? null,
        methods,
        total: {
          total: grandTotal,
          users: totalByUser,
        },
      },
    };
  }
}
