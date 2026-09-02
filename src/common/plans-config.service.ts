import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';

// Defaults de código (semilla). Si las tablas están vacías, se siembran con esto.
const DEFAULT_PLANS = [
  { id: 'DESPEGUE', name: 'Despegue', emoji: '🛫', tagline: 'Para el que arranca', priceMonthly: 0, order: 1, maxUsers: 1, maxLocals: 1, maxProducts: 50, maxCustomers: 100 },
  { id: 'IMPULSO', name: 'Impulso', emoji: '🚀', tagline: 'Negocio en marcha', priceMonthly: 39900, order: 2, maxUsers: 3, maxLocals: 1, maxProducts: null, maxCustomers: null },
  { id: 'ALTURA', name: 'Altura', emoji: '📈', tagline: 'Crece con varias sedes', priceMonthly: 89900, order: 3, maxUsers: 10, maxLocals: 3, maxProducts: null, maxCustomers: null },
  { id: 'ORBITA', name: 'Órbita', emoji: '🪐', tagline: 'Cadena o empresa', priceMonthly: 179900, order: 4, maxUsers: null, maxLocals: null, maxProducts: null, maxCustomers: null },
];

const DEFAULT_GATES: Record<string, string> = {
  expenses: 'IMPULSO',
  appointments: 'IMPULSO',
  services: 'IMPULSO',
  users: 'IMPULSO',
  statistics: 'IMPULSO',
  fiado: 'IMPULSO',
  loyalty: 'IMPULSO',
  'facturacion-electronica': 'IMPULSO',
  website: 'ALTURA',
  shipping: 'ALTURA',
  bank: 'ALTURA',
  clinical: 'ALTURA',
  payroll: 'ORBITA',
};

export interface PlanLimits {
  users: number | null;
  locals: number | null;
  products: number | null;
  customers: number | null;
}

/**
 * Fuente ÚNICA y DINÁMICA de la configuración de planes. Lee de las tablas
 * PlanConfig / PlanModuleGate (editables desde SUPER_PLATFORM) y cachea en
 * memoria. Si las tablas están vacías, siembra desde los defaults de código.
 */
@Injectable()
export class PlansConfigService implements OnModuleInit {
  private plans: any[] = [];
  private gates: Record<string, string> = {};
  private ready = false;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.seedIfEmpty();
      await this.reload();
    } catch {
      // Si la BD aún no tiene las tablas (migración pendiente), se usan defaults.
      this.plans = DEFAULT_PLANS.map((p) => ({ ...p, active: true }));
      this.gates = { ...DEFAULT_GATES };
      this.ready = true;
    }
  }

  private async seedIfEmpty() {
    if ((await this.prisma.planConfig.count()) === 0) {
      await this.prisma.planConfig.createMany({
        data: DEFAULT_PLANS.map((p) => ({ ...p, active: true })),
        skipDuplicates: true,
      });
    }
    if ((await this.prisma.planModuleGate.count()) === 0) {
      await this.prisma.planModuleGate.createMany({
        data: Object.entries(DEFAULT_GATES).map(([moduleKey, minPlan]) => ({
          moduleKey,
          minPlan,
        })),
        skipDuplicates: true,
      });
    }
  }

  async reload() {
    this.plans = await this.prisma.planConfig.findMany({
      orderBy: { order: 'asc' },
    });
    const gates = await this.prisma.planModuleGate.findMany();
    this.gates = Object.fromEntries(gates.map((g) => [g.moduleKey, g.minPlan]));
    this.ready = true;
  }

  private ensure() {
    if (!this.ready) {
      this.plans = DEFAULT_PLANS.map((p) => ({ ...p, active: true }));
      this.gates = { ...DEFAULT_GATES };
    }
  }

  // Rank del plan (por su `order`). 0 si no existe.
  planRank(planId?: string | null): number {
    this.ensure();
    if (!planId) return 0;
    const p = this.plans.find((x) => x.id === planId);
    return p ? p.order : 0;
  }

  // Plan mínimo requerido por un módulo. 'BASE' o inexistente = null (todos).
  moduleMinPlan(moduleKey: string): string | null {
    this.ensure();
    const g = this.gates[moduleKey];
    if (!g || g === 'BASE') return null;
    return g;
  }

  planAllowsModule(plan: string | null | undefined, moduleKey: string): boolean {
    const min = this.moduleMinPlan(moduleKey);
    if (!min) return true; // módulo base
    if (!plan) return true; // sin plan → sin gating (no rompe existentes)
    const rank = this.planRank(plan);
    if (!rank) return true; // plan desconocido → sin gating
    return rank >= this.planRank(min);
  }

  limits(planId?: string | null): PlanLimits {
    this.ensure();
    const p = this.plans.find((x) => x.id === planId);
    if (!p) return { users: null, locals: null, products: null, customers: null };
    return {
      users: p.maxUsers,
      locals: p.maxLocals,
      products: p.maxProducts,
      customers: p.maxCustomers,
    };
  }

  planName(planId?: string | null): string {
    this.ensure();
    return this.plans.find((x) => x.id === planId)?.name || planId || '';
  }

  // Configuración completa para la UI de SUPER_PLATFORM.
  config() {
    this.ensure();
    return { plans: this.plans, gates: this.gates };
  }
}
