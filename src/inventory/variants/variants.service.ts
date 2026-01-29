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
    incomingVariants: InventoryVariantSyncInput[],
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

    const existingVariants = await this.prisma.inventoryVariant.findMany({
      where: { inventoryId },
    });

    const incomingIds = incomingVariants.filter((v) => v.id).map((v) => v.id);

    // DESACTIVAR + STOCK = 0
    const toDeactivate = existingVariants.filter(
      (v) => v.isActive && !incomingIds.includes(v.id),
    );

    for (const variant of toDeactivate) {
      await this.prisma.inventoryVariant.update({
        where: { id: variant.id },
        data: {
          isActive: false,
          stock: 0,
        },
      });
    }

    // ACTUALIZAR EXISTENTES
    for (const v of incomingVariants.filter((v) => v.id)) {
      const current = existingVariants.find((ev) => ev.id === v.id);
      if (!current) continue;

      let sku = current.sku;

      if (current.color !== v.color) {
        sku = generateSku(inventory.name, current.sequence, v.color);
      }

      await this.prisma.inventoryVariant.update({
        where: { id: v.id },
        data: {
          color: v.color,
          stock: v.stock,
          sku,
          isActive: true,
        },
      });
    }

    // CREAR NUEVAS
    for (const v of incomingVariants.filter((v) => !v.id)) {
      const created = await this.prisma.inventoryVariant.create({
        data: {
          inventoryId,
          color: v.color,
          stock: v.stock,
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
