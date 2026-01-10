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

  async addVariants(
    inventoryId: number,
    variants: { color: string; stock: number }[],
    user: any,
  ) {
    console.log('Adding variants to inventory ID:', user.role);
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
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
      const existing = inventory.variants.find((iv) => iv.color === v.color);

      if (existing) {
        // SUMAR STOCK
        const updated = await this.prisma.inventoryVariant.update({
          where: { id: existing.id },
          data: {
            stock: { increment: v.stock },
          },
        });
        result.push(updated);
      } else {
        // CREAR VARIANTE
        const variant = await this.prisma.inventoryVariant.create({
          data: {
            color: v.color,
            stock: v.stock,
            inventoryId,
            sku: 'PENDING',
          },
        });

        const sku = generateSku(
          inventory.name,
          variant.sequence,
          variant.color,
        );

        const updated = await this.prisma.inventoryVariant.update({
          where: { id: variant.id },
          data: { sku },
        });

        result.push(updated);
      }
    }

    return {
      success: true,
      message: 'Stock actualizado correctamente',
      data: result,
    };
  }
}
