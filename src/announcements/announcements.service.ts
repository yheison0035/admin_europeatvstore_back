import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '@/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(private prisma: PrismaService) {}

  private assertPlatform(user: any) {
    if (user?.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }
  }

  private toData(dto: CreateAnnouncementDto | UpdateAnnouncementDto) {
    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.body !== undefined) data.body = dto.body.trim();
    if (dto.level !== undefined) data.level = dto.level;
    if (dto.audience !== undefined) data.audience = dto.audience;
    if (dto.types !== undefined) data.types = dto.types ?? [];
    if (dto.plans !== undefined) data.plans = dto.plans ?? [];
    if (dto.ctaLabel !== undefined) data.ctaLabel = dto.ctaLabel?.trim() || null;
    if (dto.ctaUrl !== undefined) data.ctaUrl = dto.ctaUrl?.trim() || null;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.startsAt !== undefined)
      data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    if (dto.endsAt !== undefined)
      data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    return data;
  }

  // ---- Plataforma (CRUD) ----
  async findAll(user: any) {
    this.assertPlatform(user);
    const items = await this.prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: items };
  }

  async create(user: any, dto: CreateAnnouncementDto) {
    this.assertPlatform(user);
    const item = await this.prisma.announcement.create({
      data: {
        title: dto.title.trim(),
        body: dto.body.trim(),
        level: dto.level ?? 'INFO',
        audience: dto.audience ?? 'ALL',
        types: dto.types ?? [],
        plans: dto.plans ?? [],
        ctaLabel: dto.ctaLabel?.trim() || null,
        ctaUrl: dto.ctaUrl?.trim() || null,
        active: dto.active ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });
    return { success: true, data: item };
  }

  async update(user: any, id: number, dto: UpdateAnnouncementDto) {
    this.assertPlatform(user);
    const found = await this.prisma.announcement.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Comunicado no encontrado');
    const item = await this.prisma.announcement.update({
      where: { id },
      data: this.toData(dto),
    });
    return { success: true, data: item };
  }

  async remove(user: any, id: number) {
    this.assertPlatform(user);
    const found = await this.prisma.announcement.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Comunicado no encontrado');
    await this.prisma.announcement.delete({ where: { id } });
    return { success: true };
  }

  // ---- Para el negocio autenticado: solo los que le corresponden y vigentes ----
  async activeForUser(user: any) {
    if (!user?.companyId) return { success: true, data: [] };
    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { type: true, plan: true },
    });
    if (!company) return { success: true, data: [] };

    const now = new Date();
    const items = await this.prisma.announcement.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    // Segmentación: nada mezclado. Cada negocio solo ve lo suyo.
    const matched = items.filter((a) => {
      if (a.audience === 'TYPE') return a.types.includes(company.type);
      if (a.audience === 'PLAN')
        return !!company.plan && a.plans.includes(company.plan);
      return true; // ALL
    });

    return { success: true, data: matched };
  }
}
