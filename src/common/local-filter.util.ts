import { Role } from '@prisma/client';

export function applyLocalFilter(
  where: any,
  user: any,
  localIds: number[] | null,
  model: 'default' | 'local' | 'sale' | 'expense' = 'default',
) {
  // Sin filtro (super admin / roles globales)
  if (localIds === null) return;

  // Sin acceso
  if (localIds.length === 0) {
    where.id = -1;
    return;
  }

  where.AND = where.AND || [];

  // CASO 1: TABLA LOCAL
  if (model === 'local') {
    where.AND.push({
      id: { in: localIds },
    });
    return;
  }

  // CASO 2: SALES (SIEMPRE tienen localId)
  if (model === 'sale' || model === 'expense') {
    where.AND.push({
      localId: { in: localIds },
    });
    return;
  }

  // CASO 3: MODELOS GENERALES (category, brand, inventory, etc.)
  where.AND.push({
    OR: [
      { localId: { in: localIds } }, // locales permitidos
    ],
  });
}
