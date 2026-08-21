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

  // Historial completo de un registro (para el detalle). Además, resuelve los
  // campos que guardan IDs (Vendedor, Cliente, Local, Proveedor, Categoría,
  // Marca, Servicio, Barbero) a NOMBRES legibles, para que el dueño entienda
  // exactamente qué cambió sin ver números internos.
  async history(entity: string, entityId: number, companyId: number) {
    const logs = await this.prisma.auditLog.findMany({
      where: { entity, entityId, companyId },
      orderBy: { createdAt: 'desc' },
    });

    // Campo -> tabla de la que se toma el nombre.
    const REL: Record<string, string> = {
      userId: 'user',
      barberId: 'user',
      customerId: 'customer',
      localId: 'local',
      providerId: 'provider',
      categoryId: 'category',
      brandId: 'brand',
      serviceId: 'service',
    };

    // 1) Recolecta todos los IDs referenciados en los cambios, por tabla.
    const need: Record<string, Set<number>> = {
      user: new Set(),
      customer: new Set(),
      local: new Set(),
      provider: new Set(),
      category: new Set(),
      brand: new Set(),
      service: new Set(),
    };
    for (const log of logs) {
      const ch = log.changes as Record<string, any> | null;
      if (!ch) continue;
      for (const [field, val] of Object.entries(ch)) {
        const model = REL[field];
        if (!model) continue;
        for (const raw of [val?.before, val?.after]) {
          const id = Number(raw);
          if (raw != null && !Number.isNaN(id)) need[model].add(id);
        }
      }
    }

    // 2) Trae los nombres de cada tabla en lote.
    const pick = (m: string) => (need[m].size ? [...need[m]] : [-1]);
    const [users, customers, locals, providers, categories, brands, services] =
      await Promise.all([
        this.prisma.user.findMany({
          where: { id: { in: pick('user') } },
          select: { id: true, name: true },
        }),
        this.prisma.customer.findMany({
          where: { id: { in: pick('customer') } },
          select: { id: true, name: true },
        }),
        this.prisma.local.findMany({
          where: { id: { in: pick('local') } },
          select: { id: true, name: true },
        }),
        this.prisma.provider.findMany({
          where: { id: { in: pick('provider') } },
          select: { id: true, name: true },
        }),
        this.prisma.category.findMany({
          where: { id: { in: pick('category') } },
          select: { id: true, name: true },
        }),
        this.prisma.brand.findMany({
          where: { id: { in: pick('brand') } },
          select: { id: true, name: true },
        }),
        this.prisma.service.findMany({
          where: { id: { in: pick('service') } },
          select: { id: true, name: true },
        }),
      ]);

    const maps: Record<string, Map<number, string>> = {
      user: new Map(users.map((u) => [u.id, u.name])),
      customer: new Map(customers.map((c) => [c.id, c.name])),
      local: new Map(locals.map((l) => [l.id, l.name])),
      provider: new Map(providers.map((p) => [p.id, p.name])),
      category: new Map(categories.map((c) => [c.id, c.name])),
      brand: new Map(brands.map((b) => [b.id, b.name])),
      service: new Map(services.map((s) => [s.id, s.name])),
    };

    const toName = (model: string, raw: any) => {
      if (raw == null || raw === '') return raw;
      const id = Number(raw);
      if (Number.isNaN(id)) return raw;
      return maps[model].get(id) || `#${id}`;
    };

    // 3) Reescribe los cambios: los campos relacionales pasan a mostrar nombres.
    return logs.map((log) => {
      const ch = log.changes as Record<string, any> | null;
      if (!ch) return log;
      const enriched: Record<string, any> = {};
      for (const [field, val] of Object.entries(ch)) {
        const model = REL[field];
        enriched[field] = model
          ? { before: toName(model, val?.before), after: toName(model, val?.after) }
          : val;
      }
      return { ...log, changes: enriched };
    });
  }
}
