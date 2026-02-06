import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateLocalDto } from './dto/create-local.dto';
import { UpdateLocalDto } from './dto/update-local.dto';
import { Role, Status } from '@prisma/client';
import { hasRole } from 'src/common/role-check.util';
import { getAccessibleLocalIds } from 'src/common/access-locals.util';

@Injectable()
export class LocalsService {
  constructor(private prisma: PrismaService) {}

  async findAllPaginated(user: any, query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const where: any = {
      status: { not: Status.ELIMINADO },
    };

    if (localIds !== null) {
      if (localIds.length === 0) {
        where.id = -1;
      } else {
        where.id = { in: localIds };
      }
    }

    if (query.name) {
      where.name = {
        contains: query.name,
        mode: 'insensitive',
      };
    }

    if (query.address) {
      where.address = {
        contains: query.address,
        mode: 'insensitive',
      };
    }

    if (query.city) {
      where.city = {
        contains: query.city,
        mode: 'insensitive',
      };
    }

    if (query.phone) {
      where.phone = {
        contains: query.phone,
        mode: 'insensitive',
      };
    }

    if (query.managerId) {
      where.manager = {
        name: {
          contains: query.managerId,
          mode: 'insensitive',
        },
      };
    }

    if (query.status) {
      const normalizedStatus = query.status.toUpperCase();

      if (Object.values(Status).includes(normalizedStatus as Status)) {
        where.status = normalizedStatus as Status;
      }
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
    const local = await this.prisma.local.findUnique({
      where: { id },
      include: {
        users: true,
        manager: true,
      },
    });

    if (!local) {
      throw new NotFoundException(`Local con ID ${id} no encontrado`);
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
    if (!hasRole(user.role, [Role.SUPER_ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const local = await this.prisma.local.create({
      data: {
        ...dto,
        managerId: dto.managerId ?? null,
      },
    });

    return {
      success: true,
      message: 'Local creado correctamente',
      data: local,
    };
  }

  async update(id: number, dto: UpdateLocalDto, user: any) {
    const found = await this.prisma.local.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException(`Local con ID ${id} no encontrado`);
    }

    // Roles globales → OK
    if (
      ![Role.SUPER_ADMIN, Role.COORDINADOR, Role.AUXILIAR].includes(user.role)
    ) {
      // ADMIN → solo sus locales
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
      const manager = await this.prisma.user.findUnique({
        where: { id: dto.managerId },
      });

      if (!manager) {
        throw new NotFoundException(
          'El usuario asignado como encargado no existe',
        );
      }

      data.manager = { connect: { id: dto.managerId } };
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
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.local.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException(`Local con ID ${id} no encontrado`);
    }

    await this.prisma.local.delete({ where: { id } });

    return {
      success: true,
      message: 'Local eliminado correctamente',
    };
  }
}
