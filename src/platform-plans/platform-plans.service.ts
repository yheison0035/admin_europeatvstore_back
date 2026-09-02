import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { PlansConfigService } from '@/common/plans-config.service';

// Administración de planes (SUPER_PLATFORM). Edita PlanConfig / PlanModuleGate y
// recarga la caché de PlansConfigService para que el gating aplique al instante.
@Injectable()
export class PlatformPlansService {
  constructor(
    private prisma: PrismaService,
    private plansConfig: PlansConfigService,
  ) {}

  // Config completa (planes + gates) para la UI.
  async getConfig() {
    await this.plansConfig.reload();
    return { success: true, data: this.plansConfig.config() };
  }

  async createPlan(dto: any) {
    const id = String(dto.id || '').trim().toUpperCase();
    if (!id) throw new NotFoundException('Falta el id del plan.');
    const plan = await this.prisma.planConfig.upsert({
      where: { id },
      create: {
        id,
        name: dto.name || id,
        emoji: dto.emoji || null,
        tagline: dto.tagline || null,
        priceMonthly: Number(dto.priceMonthly) || 0,
        order: Number(dto.order) || 99,
        active: dto.active ?? true,
        maxUsers: nn(dto.maxUsers),
        maxLocals: nn(dto.maxLocals),
        maxProducts: nn(dto.maxProducts),
        maxCustomers: nn(dto.maxCustomers),
      },
      update: {},
    });
    await this.plansConfig.reload();
    return { success: true, data: plan };
  }

  async updatePlan(id: string, dto: any) {
    const exists = await this.prisma.planConfig.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Plan no encontrado.');
    const plan = await this.prisma.planConfig.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.emoji !== undefined && { emoji: dto.emoji || null }),
        ...(dto.tagline !== undefined && { tagline: dto.tagline || null }),
        ...(dto.priceMonthly !== undefined && {
          priceMonthly: Number(dto.priceMonthly) || 0,
        }),
        ...(dto.order !== undefined && { order: Number(dto.order) || 0 }),
        ...(dto.active !== undefined && { active: !!dto.active }),
        ...(dto.maxUsers !== undefined && { maxUsers: nn(dto.maxUsers) }),
        ...(dto.maxLocals !== undefined && { maxLocals: nn(dto.maxLocals) }),
        ...(dto.maxProducts !== undefined && { maxProducts: nn(dto.maxProducts) }),
        ...(dto.maxCustomers !== undefined && {
          maxCustomers: nn(dto.maxCustomers),
        }),
      },
    });
    await this.plansConfig.reload();
    return { success: true, data: plan };
  }

  // Actualiza el mapa módulo -> plan mínimo (bulk). { moduleKey: 'IMPULSO'|'BASE'|... }
  async setGates(gates: Record<string, string>) {
    const entries = Object.entries(gates || {});
    await this.prisma.$transaction(
      entries.map(([moduleKey, minPlan]) =>
        this.prisma.planModuleGate.upsert({
          where: { moduleKey },
          create: { moduleKey, minPlan: String(minPlan || 'BASE') },
          update: { minPlan: String(minPlan || 'BASE') },
        }),
      ),
    );
    await this.plansConfig.reload();
    return { success: true, data: this.plansConfig.config().gates };
  }
}

// Normaliza a número o null (ilimitado). '' / null / 'ilimitado' -> null.
function nn(v: any): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
