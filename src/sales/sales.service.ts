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
import { PaymentMethod, PaymentStatus, Status } from '@prisma/client';
import { StockService } from 'src/inventory/stock.service';

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
      where.localId = localIds.length ? { in: localIds } : -1;
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
      throw new BadRequestException('La venta debe tener productos');
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
        inventoryVariantId: number;
        quantity: number;
        price: number;
        discount: number;
        subtotal: number;
      }[] = [];

      for (const item of dto.items) {
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
          throw new NotFoundException('Variante no válida');
        }

        const price = variant.inventory.salePrice;
        const discount = item.discount ?? 0;
        const subtotal = Math.max(price * item.quantity - discount, 0);

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

        if (!variant) throw new NotFoundException('Variante inválida');

        const price = variant.inventory.salePrice;
        const subtotal = price * item.quantity;

        await this.stockService.decrement(variant.id, item.quantity, tx);

        itemsData.push({
          inventoryVariantId: variant.id,
          quantity: item.quantity,
          price,
          discount: 0,
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
              include: { inventory: true },
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
      totalAmount: sale.totalAmount,
      items: sale.items.map((item) => ({
        product: item.variant.inventory.name,
        quantity: item.quantity,
        subtotal: item.subtotal,
      })),
    };
  }

  async dailySalesReport(dto: any, user: any) {
    const { date, localId } = dto;

    const local = await this.prisma.local.findFirst({
      where: {
        id: localId,
        companyId: user.companyId,
      },
    });

    if (!local) {
      throw new ForbiddenException('No tienes permiso');
    }

    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59`);

    const sales = await this.prisma.sale.findMany({
      where: {
        localId,
        saleDate: { gte: start, lte: end },
      },
    });

    const total = sales.reduce((acc, s) => acc + s.totalAmount, 0);

    return {
      success: true,
      data: {
        total,
        count: sales.length,
      },
    };
  }

  async rangeSalesReport(dto: any, user: any) {
    const { startDate, endDate, localId } = dto;

    const local = await this.prisma.local.findFirst({
      where: {
        id: localId,
        companyId: user.companyId,
      },
    });

    if (!local) {
      throw new ForbiddenException('No tienes permiso');
    }

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59`);

    const sales = await this.prisma.sale.findMany({
      where: {
        localId,
        saleDate: {
          gte: new Date(start),
          lte: new Date(end),
        },
      },
    });

    const total = sales.reduce((acc, s) => acc + s.totalAmount, 0);

    return {
      success: true,
      data: {
        total,
        count: sales.length,
      },
    };
  }
}
