import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { UpdateServiceDto } from './dto/update-service.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { getAccessibleLocalIds } from '@/common/access-locals.util';
import { Status } from '@prisma/client';
import { AuditService } from '@/audit/audit.service';

@Injectable()
export class ServicesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAllPaginated(user: any, query: any) {
    const isAll = query.all === 'true' || query.all === true;

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const where: any = {
      status: { not: 'ELIMINADO' },
    };

    // Empresa
    if (user?.companyId) {
      where.companyId = user.companyId;

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
    }

    // Usuario sin empresa (portal público o cliente)
    if (!user?.companyId) {
      if (!query.localId) {
        where.id = -1;
      } else {
        where.serviceLocals = {
          some: {
            localId: Number(query.localId),
          },
        };
      }
    }

    // Filtro explícito por local
    if (query.localId) {
      where.serviceLocals = {
        some: {
          localId: Number(query.localId),
        },
      };
    }

    // Filtro por barbero
    if (query.barberId) {
      where.barbers = {
        some: {
          id: Number(query.barberId),
        },
      };
    }

    // Filtro por nombre
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

    if (query.duration) {
      const duration = Number(query.duration);
      if (!Number.isNaN(duration)) {
        where.duration = duration;
      }
    }

    if (query.status) {
      const normalizedStatus = query.status.toUpperCase();
      if (
        Object.values(Status).includes(normalizedStatus as Status) &&
        normalizedStatus !== Status.ELIMINADO
      ) {
        where.status = normalizedStatus as Status;
      }
    }

    // Sin paginación
    if (isAll) {
      const items = await this.prisma.service.findMany({
        where,
        include: {
          serviceLocals: true,
        },
        orderBy: {
          name: 'asc',
        },
      });

      return {
        success: true,
        data: items.map((service) => ({
          id: service.id,
          name: service.name,
          duration: service.duration,
          priceFrom:
            service.serviceLocals.length > 0
              ? Math.min(...service.serviceLocals.map((local) => local.price))
              : 0,
        })),
      };
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

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
        orderBy: {
          name: 'asc',
        },
      }),
      this.prisma.service.count({ where }),
    ]);

    const auditMap = await this.audit.latestFor(
      'service',
      items.map((s) => s.id),
      user.companyId,
    );

    return {
      success: true,
      data: items.map((s) => ({ ...s, lastAudit: auditMap[s.id] || null })),
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

    if (user?.companyId && service.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes acceso a este servicio');
    }

    return {
      success: true,
      data: service,
    };
  }

  async create(dto: CreateServiceDto, user: any) {
    const service = await this.prisma.service.create({
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

    await this.audit.log({
      entity: 'service',
      entityId: service.id,
      action: 'CREATE',
      user,
    });

    return service;
  }

  async update(id: number, dto: UpdateServiceDto, user: any) {
    const service = await this.prisma.service.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!service) throw new NotFoundException();

    const updated = await this.prisma.service.update({
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

    const changes = this.audit.diff(service, dto, [
      'name',
      'description',
      'duration',
      'status',
    ]);
    await this.audit.log({
      entity: 'service',
      entityId: id,
      action: 'UPDATE',
      user,
      changes,
    });

    return updated;
  }

  async remove(id: number, user: any) {
    const service = await this.prisma.service.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!service) throw new NotFoundException();

    await this.prisma.service.delete({
      where: { id },
    });

    await this.audit.log({
      entity: 'service',
      entityId: id,
      action: 'DELETE',
      user,
    });

    return { success: true };
  }

  async findAllPublic(query: any) {
    const localId = Number(query.localId);

    if (!localId || isNaN(localId)) {
      return {
        success: true,
        data: [],
      };
    }

    const where: any = {
      status: 'ACTIVO',
      serviceLocals: {
        some: {
          localId,
        },
      },
    };

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
}
