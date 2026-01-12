import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { hasRole } from 'src/common/role-check.util';
import { InventoryVariant, Role } from '@prisma/client';
import { generateSku } from 'utils/sku.util';

@Injectable()
export class VariantsService {
  constructor(private prisma: PrismaService) {}

  async syncVariants(
    inventoryId: number,
    variants: {
      id?: number;
      color: string;
      stock: number;
    }[],
    user: any,
  ) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN, Role.ASESOR])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const inventory = await this.prisma.inventory.findUnique({
      where: { id: inventoryId },
      include: { variants: true },
    });

    if (!inventory) {
      throw new NotFoundException('Producto no encontrado');
    }

    const result: InventoryVariant[] = [];

    for (const v of variants) {
      if (v.id) {
        const updated = await this.prisma.inventoryVariant.update({
          where: { id: v.id },
          data: {
            color: v.color,
            stock: v.stock,
          },
        });
        result.push(updated);
      } else {
        const created = await this.prisma.inventoryVariant.create({
          data: {
            color: v.color,
            stock: v.stock,
            inventoryId,
            sku: 'PENDING',
          },
        });

        const sku = generateSku(
          inventory.name,
          created.sequence,
          created.color,
        );

        const withSku = await this.prisma.inventoryVariant.update({
          where: { id: created.id },
          data: { sku },
        });

        result.push(withSku);
      }
    }

    const incomingIds = variants.filter((v) => v.id).map((v) => v.id);

    const toDelete = inventory.variants.filter(
      (v) => !incomingIds.includes(v.id),
    );

    if (toDelete.length > 0) {
      await this.prisma.inventoryVariant.deleteMany({
        where: { id: { in: toDelete.map((v) => v.id) } },
      });
    }

    return {
      success: true,
      message: 'Variantes sincronizadas correctamente',
      data: result,
    };
  }
}
