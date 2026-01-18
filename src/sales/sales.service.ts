import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const sales = await this.prisma.sale.findMany({
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
      data: sales,
    };
  }

  async findOne(id: number) {
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

    return {
      success: true,
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
        const discount = item.discount ?? 0;

        const base = item.quantity * price;
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
        const discount = item.discount ?? 0;

        const base = item.quantity * price;
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

  async remove(id: number) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada');
    }

    return this.prisma.$transaction(async (tx) => {
      // Devolver stock
      for (const item of sale.items) {
        await tx.inventoryVariant.update({
          where: { id: item.inventoryVariantId },
          data: {
            stock: { increment: item.quantity },
          },
        });
      }

      // Eliminar venta (cascade elimina items)
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
}
