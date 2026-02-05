import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class StockService {
  constructor(private prisma: PrismaService) {}

  async decrement(
    variantId: number,
    quantity: number,
    tx: Prisma.TransactionClient,
  ) {
    const updated = await tx.inventoryVariant.updateMany({
      where: {
        id: variantId,
        stock: { gte: quantity },
      },
      data: {
        stock: { decrement: quantity },
      },
    });

    if (updated.count === 0) {
      throw new BadRequestException(
        'Stock insuficiente o variante no disponible',
      );
    }
  }

  async increment(
    variantId: number,
    quantity: number,
    tx: Prisma.TransactionClient,
  ) {
    await tx.inventoryVariant.update({
      where: { id: variantId },
      data: {
        stock: { increment: quantity },
      },
    });
  }
}
