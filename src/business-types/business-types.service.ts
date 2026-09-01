import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessType, Role } from '@prisma/client';
import { PrismaService } from '@/prisma.service';
import {
  BUSINESS_TYPE_LABELS,
  BUSINESS_TYPE_MODULES,
} from './business-types.seed';

@Injectable()
export class BusinessTypesService {
  constructor(private prisma: PrismaService) {}

  private assertPlatform(user: any) {
    if (user?.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }
  }

  // Crea las filas que aún no existan (a partir del enum + la semilla). No pisa
  // lo que la plataforma ya haya editado.
  private async ensureSeeded() {
    const existing = await this.prisma.businessTypeConfig.findMany({
      select: { type: true },
    });
    const have = new Set(existing.map((e) => e.type));
    const missing = Object.values(BusinessType).filter((t) => !have.has(t));
    if (!missing.length) return;
    await this.prisma.businessTypeConfig.createMany({
      data: missing.map((type) => ({
        type,
        label: BUSINESS_TYPE_LABELS[type] || type,
        modules: BUSINESS_TYPE_MODULES[type] || [],
        active: true,
      })),
      skipDuplicates: true,
    });
  }

  async findAll(user: any) {
    this.assertPlatform(user);
    await this.ensureSeeded();
    const items = await this.prisma.businessTypeConfig.findMany({
      orderBy: { label: 'asc' },
    });
    return { success: true, data: items };
  }

  async update(
    user: any,
    type: string,
    dto: { label?: string; modules?: string[]; active?: boolean },
  ) {
    this.assertPlatform(user);
    const found = await this.prisma.businessTypeConfig.findUnique({
      where: { type },
    });
    if (!found) throw new NotFoundException('Tipo de negocio no encontrado');

    const data: any = {};
    if (dto.label !== undefined) data.label = dto.label.trim() || found.label;
    if (dto.modules !== undefined)
      data.modules = Array.isArray(dto.modules) ? dto.modules : [];
    if (dto.active !== undefined) data.active = dto.active;

    const updated = await this.prisma.businessTypeConfig.update({
      where: { type },
      data,
    });
    return { success: true, data: updated };
  }

  // Módulos configurados para un tipo (para el gating del front). Devuelve null
  // si no hay fila (el front usa su hardcode como respaldo).
  async resolveModules(type: string): Promise<string[] | null> {
    if (!type) return null;
    const cfg = await this.prisma.businessTypeConfig.findUnique({
      where: { type },
      select: { modules: true, active: true },
    });
    if (!cfg || !cfg.active) return null;
    return cfg.modules;
  }
}
