import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { Prisma } from '@prisma/client';
import { SetRecipeDto } from './dto/set-recipe.dto';

@Injectable()
export class RecipesService {
  constructor(private prisma: PrismaService) {}

  // Receta de un plato: lista de insumos y cuánto consume cada unidad.
  async getRecipe(inventoryId: number, user: any) {
    const dish = await this.prisma.inventory.findFirst({
      where: { id: inventoryId, companyId: user.companyId },
      select: { id: true },
    });
    if (!dish) throw new NotFoundException('Producto no encontrado');

    const items = await this.prisma.recipeItem.findMany({
      where: { inventoryId, companyId: user.companyId },
      include: {
        supply: { select: { id: true, name: true, unit: true, stock: true } },
      },
      orderBy: { id: 'asc' },
    });
    return { success: true, data: items };
  }

  // Reemplaza la receta completa del plato (borra e inserta).
  async setRecipe(inventoryId: number, dto: SetRecipeDto, user: any) {
    const dish = await this.prisma.inventory.findFirst({
      where: { id: inventoryId, companyId: user.companyId },
      select: { id: true },
    });
    if (!dish) throw new NotFoundException('Producto no encontrado');

    const lines = (dto.items || []).filter(
      (l) => l.supplyId && Number(l.quantity) > 0,
    );

    // Todos los insumos deben ser de la empresa.
    if (lines.length) {
      const ids = [...new Set(lines.map((l) => Number(l.supplyId)))];
      const found = await this.prisma.supply.count({
        where: { id: { in: ids }, companyId: user.companyId },
      });
      if (found !== ids.length) {
        throw new BadRequestException('Algún insumo no es válido');
      }
    }

    await this.prisma.$transaction([
      this.prisma.recipeItem.deleteMany({ where: { inventoryId } }),
      this.prisma.recipeItem.createMany({
        data: lines.map((l) => ({
          inventoryId,
          supplyId: Number(l.supplyId),
          quantity: Number(l.quantity),
          companyId: user.companyId,
        })),
      }),
    ]);

    return this.getRecipe(inventoryId, user);
  }

  // Descuenta los insumos consumidos por los platos vendidos. Se llama DENTRO
  // de la transacción de la venta. No bloquea si un insumo queda negativo: una
  // venta nunca debe fallar por un conteo de insumo descuadrado.
  async consume(
    tx: Prisma.TransactionClient,
    companyId: number,
    soldItems: { inventoryId: number; quantity: number }[],
    userId?: number | null,
  ) {
    if (!soldItems?.length) return;

    const inventoryIds = [...new Set(soldItems.map((s) => s.inventoryId))];
    const recipes = await tx.recipeItem.findMany({
      where: { companyId, inventoryId: { in: inventoryIds } },
    });
    if (!recipes.length) return;

    const byInventory = new Map<number, typeof recipes>();
    for (const r of recipes) {
      const arr = byInventory.get(r.inventoryId) || [];
      arr.push(r);
      byInventory.set(r.inventoryId, arr);
    }

    // Suma total a descontar por insumo.
    const supplyDelta = new Map<number, number>();
    for (const s of soldItems) {
      const items = byInventory.get(s.inventoryId);
      if (!items) continue;
      for (const r of items) {
        supplyDelta.set(
          r.supplyId,
          (supplyDelta.get(r.supplyId) || 0) + r.quantity * s.quantity,
        );
      }
    }

    for (const [supplyId, qty] of supplyDelta) {
      if (qty <= 0) continue;
      await tx.supply.update({
        where: { id: supplyId },
        data: { stock: { decrement: qty } },
      });
      await tx.supplyMovement.create({
        data: {
          supplyId,
          type: 'SALIDA',
          quantity: qty,
          reason: 'Consumo por venta',
          userId: userId ?? null,
          companyId,
        },
      });
    }
  }
}
