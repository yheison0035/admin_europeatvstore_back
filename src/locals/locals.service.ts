import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { CreateLocalDto } from './dto/create-local.dto';
import { UpdateLocalDto } from './dto/update-local.dto';
import { Role, Status } from '@prisma/client';
import { hasRole } from '@/common/role-check.util';
import { getAccessibleLocalIds } from '@/common/access-locals.util';
import { applyLocalFilter } from '@/common/local-filter.util';
import { PlanLimitsService } from '@/common/plan-limits.service';

@Injectable()
export class LocalsService {
  constructor(
    private prisma: PrismaService,
    private planLimits: PlanLimitsService,
  ) {}

  async findAllPaginated(user: any, query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    // El SUPER_PLATFORM_ADMIN puede listar los locales de CUALQUIER empresa
    // pasando ?companyId=. Los demás usan su propia empresa.
    const isPlatform = user?.role === Role.SUPER_PLATFORM_ADMIN;
    const companyId = isPlatform ? Number(query.companyId) : user?.companyId;

    if (!companyId) {
      throw new ForbiddenException('No autorizado');
    }

    const where: any = {
      companyId,
      status: { not: Status.ELIMINADO },
    };

    // El filtro por locales accesibles solo aplica a usuarios de empresa; el
    // platform admin ve todos los locales de la empresa consultada.
    if (!isPlatform) {
      const localIds = await getAccessibleLocalIds(this.prisma, user);
      applyLocalFilter(where, user, localIds, 'local');
    }

    if (query.name) {
      where.name = {
        contains: query.name,
        mode: 'insensitive',
      };
    }

    if (query.address) {
      where.address = { contains: query.address, mode: 'insensitive' };
    }

    if (query.phone) {
      where.phone = { contains: query.phone, mode: 'insensitive' };
    }

    if (query.managerId) {
      where.manager = {
        is: { name: { contains: query.managerId, mode: 'insensitive' } },
      };
    }

    if (query.city) {
      where.city = {
        contains: query.city,
        mode: 'insensitive',
      };
    }

    if (query.status) {
      where.status = query.status;
    }

    const isAll = query.all === 'true' || query.all === true;

    if (isAll) {
      const items = await this.prisma.local.findMany({
        where,
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
        },
        orderBy: { name: 'asc' },
      });

      return {
        success: true,
        data: items,
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.local.findMany({
        where,
        include: {
          users: true,
          manager: true,
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.local.count({ where }),
    ]);

    return {
      success: true,
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number, user: any) {
    const isPlatform = user?.role === Role.SUPER_PLATFORM_ADMIN;

    const local = await this.prisma.local.findFirst({
      where: isPlatform ? { id } : { id, companyId: user.companyId },
      include: {
        users: true,
        manager: true,
      },
    });

    if (!local) {
      throw new NotFoundException(`Local con ID ${id} no encontrado`);
    }

    // El platform admin puede ver cualquier local
    if (isPlatform) {
      return {
        success: true,
        message: 'Local obtenido correctamente',
        data: local,
      };
    }

    // Roles globales → permitido
    if (
      [Role.SUPER_ADMIN, Role.COORDINADOR, Role.AUXILIAR].includes(user.role)
    ) {
      return {
        success: true,
        message: 'Local obtenido correctamente',
        data: local,
      };
    }

    // ADMIN → solo si es manager
    if (user.role === Role.ADMIN && local.managerId === user.id) {
      return {
        success: true,
        message: 'Local obtenido correctamente',
        data: local,
      };
    }

    // Usuario normal → solo su local
    if (user.localId && user.localId === local.id) {
      return {
        success: true,
        message: 'Local obtenido correctamente',
        data: local,
      };
    }

    throw new ForbiddenException('No tienes acceso a este local');
  }

  async create(dto: CreateLocalDto, user: any) {
    const isPlatform = user.role === Role.SUPER_PLATFORM_ADMIN;

    if (!isPlatform && !hasRole(user.role, [Role.SUPER_ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    // El platform admin indica la empresa destino (dto.companyId); los demás
    // crean siempre en su propia empresa.
    const companyId = isPlatform ? Number(dto.companyId) : user.companyId;

    if (!companyId) {
      throw new ForbiddenException('Falta la empresa destino');
    }

    if (isPlatform) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });
      if (!company) {
        throw new NotFoundException('Empresa no encontrada');
      }
    }

    // Límite de sedes según el plan de la empresa.
    await this.planLimits.assertCanCreate(companyId, 'locals');

    const local = await this.prisma.local.create({
      data: {
        name: dto.name,
        address: dto.address,
        city: dto.city,
        department: dto.department,
        phone: dto.phone,
        status: dto.status ?? Status.ACTIVO,
        managerId: dto.managerId ?? null,

        companyId,
      },
    });

    return {
      success: true,
      message: 'Local creado correctamente',
      data: local,
    };
  }

  async update(id: number, dto: UpdateLocalDto, user: any) {
    const isPlatform = user.role === Role.SUPER_PLATFORM_ADMIN;

    const found = await this.prisma.local.findFirst({
      where: isPlatform ? { id } : { id, companyId: user.companyId },
    });

    if (!found) {
      throw new NotFoundException(`Local con ID ${id} no encontrado`);
    }

    // Roles globales → OK (el platform admin puede editar cualquier local)
    if (
      !isPlatform &&
      ![Role.SUPER_ADMIN, Role.COORDINADOR, Role.AUXILIAR].includes(user.role)
    ) {
      if (user.role === Role.ADMIN && found.managerId !== user.id) {
        throw new ForbiddenException('No puedes modificar este local');
      }
    }

    const data: any = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.address !== undefined && { address: dto.address }),
      ...(dto.city !== undefined && { city: dto.city }),
      ...(dto.department !== undefined && { department: dto.department }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.status !== undefined && { status: dto.status }),
    };

    if (dto.managerId !== undefined) {
      if (dto.managerId === null) {
        // Reenviar el local sin encargado no debe romper: se desvincula.
        data.manager = { disconnect: true };
      } else {
        const manager = await this.prisma.user.findFirst({
          where: {
            id: dto.managerId,
            companyId: found.companyId,
          },
        });

        if (!manager) {
          throw new NotFoundException('El manager no pertenece a la empresa');
        }

        data.manager = { connect: { id: dto.managerId } };
      }
    }

    const updated = await this.prisma.local.update({
      where: { id },
      data,
      include: {
        users: true,
        manager: true,
      },
    });

    return {
      success: true,
      message: 'Local actualizado correctamente',
      data: updated,
    };
  }

  async remove(id: number, user: any) {
    const isPlatform = user.role === Role.SUPER_PLATFORM_ADMIN;

    if (!isPlatform && !hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.local.findFirst({
      where: isPlatform ? { id } : { id, companyId: user.companyId },
    });

    if (!found) {
      throw new NotFoundException(`Local con ID ${id} no encontrado`);
    }

    await this.prisma.local.delete({ where: { id } });

    return {
      success: true,
      message: 'Local eliminado correctamente',
    };
  }

  // ACTIVAR / DESACTIVAR un local (operativo). El platform admin puede sobre
  // cualquier empresa; el SUPER_ADMIN solo sobre su empresa.
  async setStatus(id: number, status: Status, user: any) {
    const isPlatform = user.role === Role.SUPER_PLATFORM_ADMIN;

    if (!isPlatform && !hasRole(user.role, [Role.SUPER_ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    if (status !== Status.ACTIVO && status !== Status.INACTIVO) {
      throw new ForbiddenException('Estado no válido');
    }

    const found = await this.prisma.local.findFirst({
      where: isPlatform ? { id } : { id, companyId: user.companyId },
    });

    if (!found || found.status === Status.ELIMINADO) {
      throw new NotFoundException(`Local con ID ${id} no encontrado`);
    }

    const updated = await this.prisma.local.update({
      where: { id },
      data: { status },
    });

    return {
      success: true,
      message:
        status === Status.ACTIVO ? 'Local activado' : 'Local desactivado',
      data: updated,
    };
  }

  // Método público para obtener locales activos de una empresa
  async findAllPublic(query: any) {
    const where: any = {
      status: Status.ACTIVO,
    };

    const companyId = Number(query.companyId);

    if (!companyId || isNaN(companyId)) {
      where.id = -1;
    } else {
      where.companyId = companyId;
    }

    const items = await this.prisma.local.findMany({
      where,
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
      },
      orderBy: { name: 'asc' },
    });

    return {
      success: true,
      data: items,
    };
  }
}
