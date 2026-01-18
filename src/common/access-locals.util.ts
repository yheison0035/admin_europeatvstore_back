// src/common/access-locals.util.ts
import { PrismaService } from 'src/prisma.service';
import { Role } from '@prisma/client';

export async function getAccessibleLocalIds(
  prisma: PrismaService,
  user: any,
): Promise<number[] | null> {
  // Roles con acceso total
  if ([Role.SUPER_ADMIN, Role.COORDINADOR, Role.AUXILIAR].includes(user.role)) {
    return null; // null = sin filtro
  }

  // ADMIN = manager de uno o varios locales
  if (user.role === Role.ADMIN) {
    const managedLocals = await prisma.local.findMany({
      where: {
        managerId: user.id,
      },
      select: { id: true },
    });

    return managedLocals.map((l) => l.id);
  }

  // Usuario con un solo local asignado
  if (user.localId) {
    return [user.localId];
  }

  // Sin acceso
  return [];
}
