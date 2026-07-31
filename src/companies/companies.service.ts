import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Role, Status } from '@prisma/client';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  // LISTADO GLOBAL
  async findAllPaginated(user: any, query: any) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      status: { not: Status.ELIMINADO },
    };

    if (query.name) {
      where.name = { contains: query.name, mode: 'insensitive' };
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.manager) {
      where.manager = { contains: query.manager, mode: 'insensitive' };
    }

    if (query.phone) {
      where.phone = { contains: query.phone, mode: 'insensitive' };
    }

    if (query.status) {
      const status = query.status.toUpperCase();
      if (Object.values(Status).includes(status)) {
        where.status = status;
      }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        include: {
          users: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.company.count({ where }),
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

  // OBTENER UNA EMPRESA
  async findOne(id: number, user: any) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }

    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        users: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    return {
      success: true,
      data: company,
    };
  }

  // CREAR EMPRESA
  async create(dto: CreateCompanyDto, user: any) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }

    const company = await this.prisma.company.create({
      data: {
        name: dto.name,
        logo: dto.logo,
        phone: dto.phone,
        manager: dto.manager,
        type: dto.type,
        status: dto.status ?? Status.ACTIVO,
      },
    });

    return {
      success: true,
      message: 'Empresa creada correctamente',
      data: company,
    };
  }

  // ACTUALIZAR EMPRESA
  async update(id: number, dto: UpdateCompanyDto, user: any) {
    console.log('User role:', user.role);
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.company.findUnique({
      where: { id },
    });

    if (!found) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const updated = await this.prisma.company.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.logo !== undefined && { logo: dto.logo }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.manager !== undefined && { manager: dto.manager }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });

    return {
      success: true,
      message: 'Empresa actualizada correctamente',
      data: updated,
    };
  }

  // ACTIVAR / DESACTIVAR (suspensión por impago)
  async setStatus(id: number, status: Status, user: any) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }

    if (status !== Status.ACTIVO && status !== Status.INACTIVO) {
      throw new ForbiddenException('Estado no válido');
    }

    const found = await this.prisma.company.findUnique({ where: { id } });

    if (!found || found.status === Status.ELIMINADO) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const updated = await this.prisma.company.update({
      where: { id },
      data: { status },
    });

    return {
      success: true,
      message:
        status === Status.ACTIVO ? 'Empresa activada' : 'Empresa desactivada',
      data: updated,
    };
  }

  // ELIMINAR (SOFT DELETE)
  async remove(id: number, user: any) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.company.findUnique({
      where: { id },
    });

    if (!found) {
      throw new NotFoundException('Empresa no encontrada');
    }

    await this.prisma.company.update({
      where: { id },
      data: {
        status: Status.ELIMINADO,
      },
    });

    return {
      success: true,
      message: 'Empresa eliminada correctamente',
    };
  }
}
