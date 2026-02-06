import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { Role, Status } from '@prisma/client';
import { hasRole } from 'src/common/role-check.util';
import { getAccessibleLocalIds } from 'src/common/access-locals.util';

@Injectable()
export class BrandsService {
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
        where.localId = -1;
      } else {
        where.localId = { in: localIds };
      }
    }

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

    if (query.localId) {
      where.local = {
        name: {
          contains: query.localId,
          mode: 'insensitive',
        },
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.brand.findMany({
        where,
        include: {
          local: true,
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.brand.count({ where }),
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
      status: { not: Status.ELIMINADO },
    };

    if (localIds === null) {
    } else if (localIds.length === 0) {
      where.localId = -1;
    } else {
      where.localId = { in: localIds };
    }

    const brand = await this.prisma.brand.findFirst({
      where,
      include: {
        local: true,
      },
    });

    if (!brand) {
      throw new NotFoundException(`Marca con ID ${id} no encontrada`);
    }

    return {
      success: true,
      message: 'Marca obtenida correctamente',
      data: brand,
    };
  }

  async create(dto: CreateBrandDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const localExists = await this.prisma.local.findUnique({
      where: { id: dto.localId },
    });

    if (!localExists) {
      throw new NotFoundException(`Local con ID ${dto.localId} no existe`);
    }

    const brand = await this.prisma.brand.create({
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status ?? Status.ACTIVO,
        local: {
          connect: { id: dto.localId },
        },
      },
    });

    return {
      success: true,
      message: 'Marca creada correctamente',
      data: brand,
    };
  }

  async update(id: number, dto: UpdateBrandDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.brand.findUnique({
      where: { id },
    });

    if (!found || found.status === Status.ELIMINADO) {
      throw new NotFoundException(`Marca con ID ${id} no encontrada`);
    }

    if (dto.localId) {
      const localExists = await this.prisma.local.findUnique({
        where: { id: dto.localId },
      });

      if (!localExists) {
        throw new NotFoundException(`Local con ID ${dto.localId} no existe`);
      }
    }

    const updated = await this.prisma.brand.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description && { description: dto.description }),
        ...(dto.status && { status: dto.status }),
        ...(dto.localId && {
          local: {
            connect: { id: dto.localId },
          },
        }),
      },
    });

    return {
      success: true,
      message: 'Marca actualizada correctamente',
      data: updated,
    };
  }

  async remove(id: number, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.brand.findUnique({ where: { id } });
    if (!found || found.status === Status.ELIMINADO) {
      throw new NotFoundException(`Marca con ID ${id} no encontrada`);
    }

    await this.prisma.brand.update({
      where: { id },
      data: { status: Status.ELIMINADO },
    });

    return {
      success: true,
      message: 'Marca eliminada correctamente',
    };
  }
}
