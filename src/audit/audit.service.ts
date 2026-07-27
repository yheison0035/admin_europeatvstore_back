import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

type AuditActionType = 'CREATE' | 'UPDATE' | 'DELETE';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  // Calcula qué campos cambiaron (antes -> después) entre el registro viejo
  // y los nuevos datos. Solo considera los campos indicados.
  diff(oldObj: any, newObj: any, fields: string[]) {
    const changes: Record<string, { before: any; after: any }> = {};
    for (const f of fields) {
      if (newObj?.[f] === undefined) continue; // no se envió este campo
      const before = oldObj?.[f] ?? null;
      const after = newObj?.[f] ?? null;
      if (String(before) !== String(after)) {
        changes[f] = { before, after };
      }
    }
    return changes;
  }

  // Registra una entrada de auditoría. No rompe la operación si falla.
  async log(params: {
    entity: string;
    entityId: number;
    action: AuditActionType;
    user: any;
    changes?: Record<string, any>;
    client?: any;
  }) {
    const { entity, entityId, action, user, changes, client } = params;
    const db = client || this.prisma;
    try {
      await db.auditLog.create({
        data: {
          entity,
          entityId,
          action,
          changes:
            changes && Object.keys(changes).length ? changes : undefined,
          userId: user?.id ?? null,
          userName: user?.name || user?.email || 'Sistema',
          companyId: user?.companyId,
        },
      });
    } catch (e) {
      console.error('AuditLog error:', e?.message);
    }
  }

  // Último movimiento por cada id (para mostrar en el listado).
  async latestFor(entity: string, ids: number[], companyId: number) {
    if (!ids?.length) return {};
    const logs = await this.prisma.auditLog.findMany({
      where: { entity, entityId: { in: ids }, companyId },
      orderBy: { createdAt: 'desc' },
      distinct: ['entityId'],
      select: {
        entityId: true,
        action: true,
        userName: true,
        changes: true,
        createdAt: true,
      },
    });
    const map: Record<number, any> = {};
    for (const l of logs) {
      map[l.entityId] = {
        action: l.action,
        userName: l.userName,
        fields: l.changes ? Object.keys(l.changes as object) : [],
        at: l.createdAt,
      };
    }
    return map;
  }

  // Historial completo de un registro (para el detalle).
  async history(entity: string, entityId: number, companyId: number) {
    return this.prisma.auditLog.findMany({
      where: { entity, entityId, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
