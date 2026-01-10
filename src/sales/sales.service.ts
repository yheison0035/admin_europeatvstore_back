import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSaleDto, user: any) {
    return this.prisma.$transaction(async (tx) => {
      let total = 0;

      const itemsData: {
        inventoryVariantId: number;
        quantity: number;
        price: number;
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

        if (variant.stock < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para ${variant.inventory.name} - ${variant.color}`,
          );
        }

        const price = variant.inventory.salePrice;
        const subtotal = item.quantity * price;
        total += subtotal;

        await tx.inventoryVariant.update({
          where: { id: variant.id },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });

        itemsData.push({
          inventoryVariantId: variant.id,
          quantity: item.quantity,
          price,
          subtotal,
        });
      }

      const sale = await tx.sale.create({
        data: {
          code: `SALE-${Date.now()}`,
          totalAmount: total,
          paymentMethod: dto.paymentMethod,
          customerId: dto.customerId,
          localId: dto.localId,
          userId: user.id,

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
        },
      });

      return {
        success: true,
        message: 'Venta realizada correctamente',
        data: sale,
      };
    });
  }

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
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: sales,
    };
  }
}
