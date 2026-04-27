import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { UpdateServiceDto } from './dto/update-service.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { getAccessibleLocalIds } from 'src/common/access-locals.util';

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  async findAllPaginated(user: any, query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const where: any = {
      companyId: user.companyId,
      status: { not: 'ELIMINADO' },
    };

    if (localIds !== null) {
      if (localIds.length === 0) {
        where.id = -1;
      } else {
        where.serviceLocals = {
          some: {
            localId: { in: localIds },
          },
        };
      }
    }

    if (query.name) {
      where.name = {
        contains: query.name,
        mode: 'insensitive',
      };
    }

    if (query.status) {
      where.status = query.status;
    }

    const isAll = query.all === 'true' || query.all === true;

    if (isAll) {
      const items = await this.prisma.service.findMany({
        where,
        include: {
          serviceLocals: true,
        },
        orderBy: { name: 'asc' },
      });

      const data = items.map((s) => ({
        id: s.id,
        name: s.name,
        duration: s.duration,
        status: s.status,
        priceFrom:
          s.serviceLocals.length > 0
            ? Math.min(...s.serviceLocals.map((l) => l.price))
            : 0,
      }));

      return {
        success: true,
        data,
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.service.findMany({
        where,
        include: {
          barbers: true,
          serviceLocals: {
            include: {
              local: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.service.count({ where }),
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
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: {
        barbers: true,
        serviceLocals: {
          include: {
            local: true,
          },
        },
      },
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    if (service.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes acceso a este servicio');
    }

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    if (localIds !== null) {
      const hasAccess = service.serviceLocals.some((sl) =>
        localIds.includes(sl.localId),
      );

      if (!hasAccess) {
        throw new ForbiddenException('No tienes acceso a este servicio');
      }
    }

    return {
      success: true,
      data: service,
    };
  }

  async create(dto: CreateServiceDto, user: any) {
    return this.prisma.service.create({
      data: {
        name: dto.name,
        description: dto.description,
        duration: dto.duration,
        status: dto.status ?? 'ACTIVO',
        companyId: user.companyId,

        serviceLocals: {
          create: dto.locals.map((l) => ({
            localId: l.localId,
            price: l.price,
          })),
        },

        barbers: dto.barberIds
          ? { connect: dto.barberIds.map((id) => ({ id })) }
          : undefined,
      },
    });
  }

  async update(id: number, dto: UpdateServiceDto, user: any) {
    const service = await this.prisma.service.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!service) throw new NotFoundException();

    return this.prisma.service.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        duration: dto.duration,
        status: dto.status,

        serviceLocals: dto.locals
          ? {
              deleteMany: {},
              create: dto.locals.map((l) => ({
                localId: l.localId,
                price: l.price,
              })),
            }
          : undefined,

        barbers: dto.barberIds
          ? { set: dto.barberIds.map((id) => ({ id })) }
          : undefined,
      },
    });
  }

  async remove(id: number, user: any) {
    const service = await this.prisma.service.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!service) throw new NotFoundException();

    await this.prisma.service.delete({
      where: { id },
    });

    return { success: true };
  }
}
