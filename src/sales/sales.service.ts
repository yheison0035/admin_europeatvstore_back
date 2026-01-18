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

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: any) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const where: any = {};

    // Acceso global
    if (localIds === null) {
      // sin filtro
    }
    // Sin locales → no ve ventas
    else if (localIds.length === 0) {
      where.localId = -1;
    }
    // Solo locales permitidos
    else {
      where.localId = { in: localIds };
    }

    const sales = await this.prisma.sale.findMany({
      where,
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
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      message: 'Ventas obtenidas correctamente',
      data: sales,
    };
  }

  async findOne(id: number, user: any) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
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
      throw new NotFoundException('Venta no encontrada');
    }

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    if (
      localIds !== null &&
      (!sale.localId || !localIds.includes(sale.localId))
    ) {
      throw new ForbiddenException(
        'No tienes permiso para ver ventas de otro local',
      );
    }

    return {
      success: true,
      message: 'Venta obtenida correctamente',
      data: sale,
    };
  }

  async create(dto: CreateSaleDto, user: any) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException(
        'La venta debe contener al menos un producto',
      );
    }

    if (!dto.customerId) {
      throw new BadRequestException('El cliente es obligatorio');
    }

    if (!dto.localId) {
      throw new BadRequestException('El local es obligatorio');
    }

    if (!dto.paymentMethod) {
      throw new BadRequestException('El método de pago es obligatorio');
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
          throw new NotFoundException(
            `Variante ${item.inventoryVariantId} no encontrada`,
          );
        }

        if (variant.stock < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para ${variant.inventory.name} - ${variant.color}. Disponible: ${variant.stock}`,
          );
        }

        const price = variant.inventory.salePrice;
        const base = item.quantity * price;

        const discount = Math.max(0, Math.min(item.discount ?? 0, base));

        const subtotal = base - discount;

        total += subtotal;

        const updated = await tx.inventoryVariant.updateMany({
          where: {
            id: variant.id,
            stock: { gte: item.quantity },
          },
          data: {
            stock: { decrement: item.quantity },
          },
        });

        if (updated.count === 0) {
          throw new BadRequestException(
            `No se pudo descontar stock para ${variant.inventory.name} - ${variant.color}. Otro usuario pudo haber vendido antes.`,
          );
        }

        itemsData.push({
          inventoryVariantId: variant.id,
          quantity: item.quantity,
          price,
          discount,
          subtotal,
        });
      }

      const localIds = await getAccessibleLocalIds(this.prisma, user);

      if (localIds !== null && !localIds.includes(dto.localId)) {
        throw new ForbiddenException(
          'No puedes crear ventas en un local que no administras',
        );
      }

      if (dto.items.some((i) => i.quantity <= 0)) {
        throw new BadRequestException('La cantidad debe ser mayor a 0');
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

      return {
        success: true,
        message: 'Venta realizada correctamente',
        data: sale,
      };
    });
  }

  async update(id: number, dto: UpdateSaleDto, user: any) {
    return this.prisma.$transaction(async (tx) => {
      // Buscar la venta actual con sus items
      const sale = await tx.sale.findUnique({
        where: { id },
        include: {
          items: true,
        },
      });

      if (!sale) {
        throw new NotFoundException('Venta no encontrada');
      }

      // Preparar data base a actualizar (sin tocar items aún)
      const updateData: any = {
        paymentMethod: dto.paymentMethod ?? sale.paymentMethod,
        paymentStatus: dto.paymentStatus ?? sale.paymentStatus,
        saleStatus: dto.saleStatus ?? sale.saleStatus,
        saleDate: dto.saleDate ? new Date(dto.saleDate) : sale.saleDate,
        notes: dto.notes ?? sale.notes,
        customerId: dto.customerId ?? sale.customerId,
        localId: dto.localId ?? sale.localId,
        userId: dto.userId ?? sale.userId,
      };

      const localIds = await getAccessibleLocalIds(this.prisma, user);

      if (
        localIds !== null &&
        (!sale.localId || !localIds.includes(sale.localId))
      ) {
        throw new ForbiddenException(
          'No tienes permiso para modificar ventas de otro local',
        );
      }

      // Si NO vienen items → solo actualizar campos administrativos
      if (!dto.items || dto.items.length === 0) {
        const updatedSale = await tx.sale.update({
          where: { id },
          data: updateData,
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

        return {
          success: true,
          message: 'Venta actualizada correctamente (sin modificar productos)',
          data: updatedSale,
        };
      }

      // ==============================
      // VIENEN ITEMS → REAJUSTAR STOCK
      // ==============================

      // Devolver stock de los items actuales
      for (const item of sale.items) {
        await tx.inventoryVariant.update({
          where: { id: item.inventoryVariantId },
          data: {
            stock: { increment: item.quantity },
          },
        });
      }

      // Eliminar items actuales
      await tx.saleItem.deleteMany({
        where: { saleId: id },
      });

      // Procesar nuevos items
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
          throw new NotFoundException(
            `Variante ${item.inventoryVariantId} no encontrada`,
          );
        }

        if (variant.stock < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para ${variant.inventory.name} - ${variant.color}. Disponible: ${variant.stock}`,
          );
        }

        const price = variant.inventory.salePrice;
        const base = item.quantity * price;

        const discount = Math.max(0, Math.min(item.discount ?? 0, base));

        const subtotal = base - discount;

        total += subtotal;

        // Descontar stock de forma segura
        const updated = await tx.inventoryVariant.updateMany({
          where: {
            id: variant.id,
            stock: { gte: item.quantity },
          },
          data: {
            stock: { decrement: item.quantity },
          },
        });

        if (updated.count === 0) {
          throw new BadRequestException(
            `No se pudo descontar stock para ${variant.inventory.name} - ${variant.color}. Otro usuario pudo haber vendido antes.`,
          );
        }

        itemsData.push({
          inventoryVariantId: variant.id,
          quantity: item.quantity,
          price,
          discount,
          subtotal,
        });
      }

      // Actualizar venta con nuevos items y nuevo total
      const updatedSale = await tx.sale.update({
        where: { id },
        data: {
          ...updateData,
          totalAmount: total,
          items: {
            create: itemsData,
          },
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

      return {
        success: true,
        message: 'Venta actualizada correctamente',
        data: updatedSale,
      };
    });
  }

  async remove(id: number, user: any) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    if (
      localIds !== null &&
      (!sale.localId || !localIds.includes(sale.localId))
    ) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar ventas de otro local',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        await tx.inventoryVariant.update({
          where: { id: item.inventoryVariantId },
          data: {
            stock: { increment: item.quantity },
          },
        });
      }

      await tx.sale.delete({
        where: { id },
      });

      return {
        success: true,
        message: 'Venta eliminada correctamente y stock restaurado',
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
}
