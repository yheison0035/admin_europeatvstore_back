import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { Role, Status } from '@prisma/client';
import { hasRole } from 'src/common/role-check.util';

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllPaginated(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      status: { not: Status.ELIMINADO },
    };

    if (query.name) {
      where.name = {
        contains: query.name,
        mode: 'insensitive',
      };
    }

    if (query.contactName) {
      where.contactName = {
        contains: query.contactName,
        mode: 'insensitive',
      };
    }

    if (query.productType) {
      where.productType = {
        contains: query.productType,
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

    if (query.status) {
      const normalizedStatus = query.status.toUpperCase();

      if (Object.values(Status).includes(normalizedStatus as Status)) {
        where.status = normalizedStatus as Status;
      }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.provider.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.provider.count({ where }),
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

  async findOne(id: number) {
    const provider = await this.prisma.provider.findUnique({
      where: { id },
    });

    if (!provider) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }

    return {
      success: true,
      message: 'Proveedor obtenido correctamente',
      data: provider,
    };
  }

  async create(dto: CreateProviderDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const provider = await this.prisma.provider.create({
      data: dto,
    });

    return {
      success: true,
      message: 'Proveedor creado correctamente',
      data: provider,
    };
  }

  async update(id: number, dto: UpdateProviderDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.provider.findUnique({
      where: { id },
    });

    if (!found) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }

    const updated = await this.prisma.provider.update({
      where: { id },
      data: dto,
    });

    return {
      success: true,
      message: 'Proveedor actualizado correctamente',
      data: updated,
    };
  }

  async remove(id: number, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.provider.findUnique({
      where: { id },
    });

    if (!found) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }

    await this.prisma.provider.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Proveedor eliminado correctamente',
    };
  }
}
