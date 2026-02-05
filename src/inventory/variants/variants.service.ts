import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { Role } from '@prisma/client';
import { hasRole } from 'src/common/role-check.util';
import { generateSku } from 'utils/sku.util';
import { InventoryVariantSyncInput } from './dto/sync-inventory-variants.dto';

@Injectable()
export class VariantsService {
  constructor(private prisma: PrismaService) {}

  async syncVariants(
    inventoryId: number,
    incoming: InventoryVariantSyncInput[],
    user: any,
  ) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
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

    /**
     * DESACTIVAR VARIANTES ELIMINADAS
     */
    for (const variant of existing) {
      if (variant.isActive && !incomingIds.includes(variant.id)) {
        await this.prisma.inventoryVariant.update({
          where: { id: variant.id },
          data: {
            isActive: false,
          },
        });
      }
    }

    /**
     * ACTUALIZAR EXISTENTES (SIN TOCAR STOCK NI SKU)
     */
    for (const v of incoming.filter((v) => v.id)) {
      await this.prisma.inventoryVariant.update({
        where: { id: v.id },
        data: {
          color: v.color,
          isActive: true,
          ...(typeof v.stock === 'number' && { stock: v.stock }),
        },
      });
    }

    /**
     * CREAR NUEVAS
     */
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
