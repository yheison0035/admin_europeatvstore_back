import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Role, Status } from '@prisma/client';
import { hasRole } from 'src/common/role-check.util';
import { getAccessibleLocalIds } from 'src/common/access-locals.util';
import { applyLocalFilter } from 'src/common/local-filter.util';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllPaginated(user: any, query: any) {
    const isAll = query.all === 'true' || query.all === true;

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const where: any = {
      status: { not: Status.ELIMINADO },
      companyId: user.companyId,
    };

    applyLocalFilter(where, user, localIds);

    if (query.name) {
      where.name = {
        contains: query.name,
        mode: 'insensitive',
      };
    }

    if (query.description) {
      where.description = {
        contains: query.description,
        mode: 'insensitive',
      };
    }

    if (query.status) {
      const normalizedStatus = query.status.toUpperCase();
      if (Object.values(Status).includes(normalizedStatus as Status)) {
        where.status = normalizedStatus as Status;
      }
    }

    if (isAll) {
      const items = await this.prisma.category.findMany({
        where,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
        },
      });

      return {
        success: true,
        data: items,
      };
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        include: {
          local: true,
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.category.count({ where }),
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
    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const where: any = {
      id,
      companyId: user.companyId,
      status: { not: Status.ELIMINADO },
    };

    applyLocalFilter(where, user, localIds);

    const category = await this.prisma.category.findFirst({
      where,
      include: {
        local: true,
      },
    });

    if (!category) {
      throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    }

    return {
      success: true,
      message: 'Categoría obtenida correctamente',
      data: category,
    };
  }

  async create(dto: CreateCategoryDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    if (dto.localId) {
      if (localIds !== null && !localIds.includes(dto.localId)) {
        throw new ForbiddenException('No puedes usar este local');
      }
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status ?? Status.ACTIVO,

        company: {
          connect: { id: user.companyId },
        },

        ...(dto.localId && {
          local: {
            connect: { id: dto.localId },
          },
        }),
      },
    });

    return {
      success: true,
      message: 'Categoría creada correctamente',
      data: category,
    };
  }

  async update(id: number, dto: UpdateCategoryDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.category.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!found || found.status === Status.ELIMINADO) {
      throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    }

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    if (dto.localId) {
      if (localIds !== null && !localIds.includes(dto.localId)) {
        throw new ForbiddenException('No puedes asignar este local');
      }
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description && { description: dto.description }),
        ...(dto.status && { status: dto.status }),

        ...(dto.localId !== undefined && {
          local: dto.localId
            ? { connect: { id: dto.localId } }
            : { disconnect: true },
        }),
      },
    });

    return {
      success: true,
      message: 'Categoría actualizada correctamente',
      data: updated,
    };
  }

  async remove(id: number, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.category.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!found || found.status === Status.ELIMINADO) {
      throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    }

    await this.prisma.category.update({
      where: { id },
      data: {
        status: Status.ELIMINADO,
      },
    });

    return {
      success: true,
      message: 'Categoría eliminada correctamente',
    };
  }
}
