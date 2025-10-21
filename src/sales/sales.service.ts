import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.sale.findMany({
      include: {
        items: { include: { product: true } },
        customer: true,
        local: true,
        user: true,
      },
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: number) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        customer: true,
        local: true,
        user: true,
      },
    });

    if (!sale) throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    return sale;
  }

  // Obtiene el siguiente número de factura desde la secuencia
  private async getNextInvoiceNumber(): Promise<number> {
    const res: any = await this.prisma
      .$queryRaw`SELECT nextval('ets_invoice_seq') as next`;
    return Number(res[0].next);
  }

  // Genera el código ETS-00001, ETS-00002, etc.
  private async generateInvoiceCode(): Promise<string> {
    const next = await this.getNextInvoiceNumber();
    return `ETS-${next.toString().padStart(5, '0')}`;
  }

  async create(dto: CreateSaleDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Debe incluir al menos un producto.');
    }

    const code = await this.generateInvoiceCode();

    return this.prisma.$transaction(async (tx) => {
      // Validar stock antes de crear la venta
      for (const item of dto.items) {
        const product = await tx.inventory.findUnique({
          where: { id: item.productId },
        });
        if (!product) {
          throw new NotFoundException(
            `Producto con ID ${item.productId} no existe`,
          );
        }
        if (product.stock < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para el producto ${product.name} (ID: ${product.id}). Stock actual: ${product.stock}`,
          );
        }
      }

      // Crear la venta
      const sale = await tx.sale.create({
        data: {
          code,
          totalAmount: dto.totalAmount,
          paymentMethod: dto.paymentMethod,
          status: dto.status,
          saleDate: dto.saleDate ? new Date(dto.saleDate) : new Date(),
          notes: dto.notes,
          customerId: dto.customerId,
          localId: dto.localId,
          userId: dto.userId,
        },
      });

      // Crear los items y actualizar stock
      for (const item of dto.items) {
        const subtotal = item.price * item.quantity;
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            subtotal,
          },
        });

        await tx.inventory.update({
          where: { id: item.productId },
          data: {
            stock: { decrement: item.quantity },
          },
        });
      }

      // Devolver la venta completa con relaciones
      return tx.sale.findUnique({
        where: { id: sale.id },
        include: {
          items: { include: { product: true } },
          customer: true,
          local: true,
          user: true,
        },
      });
    });
  }

  async update(id: number, dto: UpdateSaleDto) {
    await this.findOne(id);
    return this.prisma.sale.update({
      where: { id },
      data: {
        totalAmount: dto.totalAmount,
        paymentMethod: dto.paymentMethod,
        status: dto.status,
        saleDate: dto.saleDate ? new Date(dto.saleDate) : undefined,
        notes: dto.notes,
        customerId: dto.customerId,
        localId: dto.localId,
        userId: dto.userId,
      },
      include: {
        items: { include: { product: true } },
        customer: true,
        local: true,
        user: true,
      },
    });
  }

  async remove(id: number) {
    const sale = await this.findOne(id);

    // Restituir stock al eliminar venta
    await this.prisma.$transaction(async (tx) => {
      const items = await tx.saleItem.findMany({
        where: { saleId: id },
      });

      for (const item of items) {
        if (item.productId) {
          await tx.inventory.update({
            where: { id: item.productId },
            data: {
              stock: { increment: item.quantity },
            },
          });
        }
      }

      await tx.saleItem.deleteMany({ where: { saleId: id } });
      await tx.sale.delete({ where: { id } });
    });

    return { message: `Venta ${sale.code} eliminada y stock restituido.` };
  }
}
