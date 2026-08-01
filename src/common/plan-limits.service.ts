import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { Status } from '@prisma/client';

// Límites por plan. null = ilimitado. Debe coincidir con src/lib/plans.js del
// frontend. Las empresas SIN plan (o con un plan desconocido) NO tienen límite,
// para no bloquear a las empresas existentes hasta que se les asigne un plan.
export const PLAN_LIMITS: Record<
  string,
  {
    users: number | null;
    locals: number | null;
    products: number | null;
    customers: number | null;
  }
> = {
  DESPEGUE: { users: 1, locals: 1, products: 50, customers: 100 },
  IMPULSO: { users: 3, locals: 1, products: null, customers: null },
  ALTURA: { users: 10, locals: 3, products: null, customers: null },
  ORBITA: { users: null, locals: null, products: null, customers: null },
};

const PLAN_NAMES: Record<string, string> = {
  DESPEGUE: 'Despegue',
  IMPULSO: 'Impulso',
  ALTURA: 'Altura',
  ORBITA: 'Órbita',
};

// Orden de los planes (para comparar niveles).
const PLAN_RANK: Record<string, number> = {
  DESPEGUE: 1,
  IMPULSO: 2,
  ALTURA: 3,
  ORBITA: 4,
};

// Plan mínimo requerido por módulo/función. Los módulos que no aparecen aquí
// son base (disponibles en todos los planes). Debe coincidir con el front
// (src/lib/plans.js). Empresas sin plan o con plan desconocido = sin gating.
export const MODULE_MIN_PLAN: Record<string, string> = {
  expenses: 'IMPULSO',
  appointments: 'IMPULSO',
  services: 'IMPULSO',
  users: 'IMPULSO',
  statistics: 'IMPULSO',
  website: 'ALTURA',
  shipping: 'ALTURA',
};

export function planAllowsModule(
  plan: string | null | undefined,
  moduleKey: string,
): boolean {
  const min = MODULE_MIN_PLAN[moduleKey];
  if (!min) return true; // módulo base
  if (!plan) return true; // sin plan → sin gating (empresas existentes)
  const rank = PLAN_RANK[plan];
  if (!rank) return true; // plan desconocido → sin gating
  return rank >= PLAN_RANK[min];
}

export type PlanResource = 'users' | 'locals' | 'products' | 'customers';

const RESOURCE_LABEL: Record<PlanResource, string> = {
  users: 'usuarios',
  locals: 'sedes',
  products: 'productos',
  customers: 'clientes',
};

@Injectable()
export class PlanLimitsService {
  constructor(private prisma: PrismaService) {}

  // Lanza ForbiddenException si crear un nuevo recurso superaría el límite del
  // plan de la empresa. No cuenta los registros ELIMINADO.
  async assertCanCreate(
    companyId: number | null | undefined,
    resource: PlanResource,
  ): Promise<void> {
    if (!companyId) return;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { plan: true },
    });

    const plan = company?.plan;
    if (!plan) return; // sin plan → sin límite (empresas existentes)

    const limits = PLAN_LIMITS[plan];
    if (!limits) return; // plan desconocido → sin límite

    const max = limits[resource];
    if (max == null) return; // ilimitado

    const count = await this.countResource(companyId, resource);
    if (count >= max) {
      const planName = PLAN_NAMES[plan] ?? plan;
      throw new ForbiddenException(
        `Tu plan ${planName} permite hasta ${max} ${RESOURCE_LABEL[resource]}. ` +
          'Actualiza tu plan para agregar más.',
      );
    }
  }

  // Lanza ForbiddenException si el plan de la empresa NO incluye el módulo.
  // Empresas sin plan (o plan desconocido) no se restringen.
  async assertModule(
    companyId: number | null | undefined,
    moduleKey: string,
  ): Promise<void> {
    if (!companyId) return;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { plan: true },
    });

    if (planAllowsModule(company?.plan, moduleKey)) return;

    const min = MODULE_MIN_PLAN[moduleKey];
    throw new ForbiddenException(
      `Tu plan actual no incluye esta función. Disponible desde el plan ${
        PLAN_NAMES[min] ?? min
      }.`,
    );
  }

  private countResource(
    companyId: number,
    resource: PlanResource,
  ): Promise<number> {
    const where = { companyId, status: { not: Status.ELIMINADO } };
    switch (resource) {
      case 'users':
        return this.prisma.user.count({ where });
      case 'locals':
        return this.prisma.local.count({ where });
      case 'products':
        return this.prisma.inventory.count({ where });
      case 'customers':
        return this.prisma.customer.count({ where });
    }
  }
}
