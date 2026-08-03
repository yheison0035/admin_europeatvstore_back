import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { Role } from '@prisma/client';
import { hasRole } from '@/common/role-check.util';
import { InventoryVariantSyncInput } from './dto/sync-inventory-variants.dto';
import { generateSku } from '../../../utils/sku.util';

@Injectable()
export class VariantsService {
  constructor(private prisma: PrismaService) {}

  async syncVariants(
    inventoryId: number,
    incoming: InventoryVariantSyncInput[],
    user: any,
  ) {
    if (
      !hasRole(user.role, [
        Role.SUPER_ADMIN,
        Role.ADMIN,
        Role.RECEPCIONISTA,
      ])
    ) {
      throw new BadRequestException('No tienes permisos');
    }

    const inventory = await this.prisma.inventory.findUnique({
      where: { id: inventoryId },
      select: { id: true, name: true },
    });

    if (!inventory) {
      throw new NotFoundException('Inventario no encontrado');
    }

    const existing = await this.prisma.inventoryVariant.findMany({
      where: { inventoryId },
    });

    const incomingIds = incoming.filter((v) => v.id).map((v) => v.id);

    for (const variant of existing) {
      if (!incomingIds.includes(variant.id)) {
        await this.prisma.inventoryVariant.update({
          where: { id: variant.id },
          data: {
            isActive: false,
            stock: 0,
          },
        });
      }
    }

    for (const v of incoming.filter((v) => v.id)) {
      await this.prisma.inventoryVariant.update({
        where: { id: v.id },
        data: {
          color: v.color,
          isActive: true,
          stock: v.stock ?? 0, // 🔥 permitir cero
        },
      });
    }

    for (const v of incoming.filter((v) => !v.id)) {
      const created = await this.prisma.inventoryVariant.create({
        data: {
          inventoryId,
          color: v.color,
          stock: v.stock ?? 0,
          sku: 'PENDING',
        },
      });

      const sku = generateSku(inventory.name, created.sequence, created.color);

      await this.prisma.inventoryVariant.update({
        where: { id: created.id },
        data: { sku },
      });
    }

    return true;
  }
}
