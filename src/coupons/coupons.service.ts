import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { Coupon, Role, Status } from '@prisma/client';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private prisma: PrismaService) {}

  private assertPlatform(user: any) {
    if (user?.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }
  }

  private normalizeCode(code: string) {
    return (code || '').trim().toUpperCase();
  }

  // LISTADO (plataforma)
  async findAllPaginated(user: any, query: any) {
    this.assertPlatform(user);

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = { status: { not: Status.ELIMINADO } };
    if (query.code) {
      where.code = { contains: query.code, mode: 'insensitive' };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return {
      success: true,
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // CREAR (plataforma)
  async create(user: any, dto: CreateCouponDto) {
    this.assertPlatform(user);

    const code = this.normalizeCode(dto.code);
    const exists = await this.prisma.coupon.findUnique({ where: { code } });
    if (exists && exists.status !== Status.ELIMINADO) {
      throw new BadRequestException('Ya existe un cupón con ese código.');
    }

    this.validateDiscount(dto.discountType, dto.discountValue);

    const coupon = await this.prisma.coupon.create({
      data: {
        code,
        description: dto.description?.trim() || null,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        appliesToPlan: dto.appliesToPlan || null,
        maxRedemptions: dto.maxRedemptions ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        active: dto.active ?? true,
      },
    });

    return { success: true, message: 'Cupón creado', data: coupon };
  }

  // ACTUALIZAR (plataforma)
  async update(user: any, id: number, dto: UpdateCouponDto) {
    this.assertPlatform(user);

    const found = await this.prisma.coupon.findUnique({ where: { id } });
    if (!found || found.status === Status.ELIMINADO) {
      throw new NotFoundException('Cupón no encontrado');
    }

    if (dto.discountType || dto.discountValue !== undefined) {
      this.validateDiscount(
        dto.discountType ?? found.discountType,
        dto.discountValue ?? found.discountValue,
      );
    }

    let code = found.code;
    if (dto.code && this.normalizeCode(dto.code) !== found.code) {
      code = this.normalizeCode(dto.code);
      const dup = await this.prisma.coupon.findUnique({ where: { code } });
      if (dup && dup.id !== id && dup.status !== Status.ELIMINADO) {
        throw new BadRequestException('Ya existe un cupón con ese código.');
      }
    }

    const updated = await this.prisma.coupon.update({
      where: { id },
      data: {
        code,
        ...(dto.description !== undefined && {
          description: dto.description?.trim() || null,
        }),
        ...(dto.discountType !== undefined && { discountType: dto.discountType }),
        ...(dto.discountValue !== undefined && {
          discountValue: dto.discountValue,
        }),
        ...(dto.appliesToPlan !== undefined && {
          appliesToPlan: dto.appliesToPlan || null,
        }),
        ...(dto.maxRedemptions !== undefined && {
          maxRedemptions: dto.maxRedemptions ?? null,
        }),
        ...(dto.expiresAt !== undefined && {
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });

    return { success: true, message: 'Cupón actualizado', data: updated };
  }

  // ELIMINAR (borrado lógico)
  async remove(user: any, id: number) {
    this.assertPlatform(user);

    const found = await this.prisma.coupon.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Cupón no encontrado');

    await this.prisma.coupon.update({
      where: { id },
      data: { status: Status.ELIMINADO, active: false },
    });

    return { success: true, message: 'Cupón eliminado' };
  }

  private validateDiscount(type: any, value: number) {
    if (value < 0) throw new BadRequestException('El descuento no puede ser negativo.');
    if (type === 'PERCENT' && value > 100) {
      throw new BadRequestException('El porcentaje no puede ser mayor a 100.');
    }
  }

  // VALIDAR (público): confirma que el cupón sirve para el plan indicado y
  // devuelve el descuento. Lanza si no es válido. NO incrementa el uso.
  async validateForPlan(code: string, plan: string): Promise<Coupon> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: this.normalizeCode(code) },
    });

    if (!coupon || !coupon.active || coupon.status === Status.ELIMINADO) {
      throw new BadRequestException('El cupón no es válido.');
    }
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new BadRequestException('El cupón ya venció.');
    }
    if (
      coupon.maxRedemptions != null &&
      coupon.timesRedeemed >= coupon.maxRedemptions
    ) {
      throw new BadRequestException('El cupón alcanzó su límite de usos.');
    }
    if (coupon.appliesToPlan && coupon.appliesToPlan !== plan) {
      throw new BadRequestException('El cupón no aplica al plan seleccionado.');
    }

    return coupon;
  }

  async validateForPlanPublic(code: string, plan: string) {
    const coupon = await this.validateForPlan(code, plan);
    return {
      success: true,
      data: {
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      },
    };
  }
}
