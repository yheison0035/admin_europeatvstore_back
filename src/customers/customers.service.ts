import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { getAccessibleLocalIds } from '@/common/access-locals.util';
import { Status } from '@prisma/client';
import { applyLocalFilter } from '@/common/local-filter.util';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async findAllPaginated(user: any, query: any) {
    const isAll = query.all === 'true' || query.all === true;

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const where: any = {
      status: { not: Status.ELIMINADO },
      companyId: user.companyId,
    };

    applyLocalFilter(where, user, localIds);

    if (query.document) {
      where.document = {
        contains: query.document,
        mode: 'insensitive',
      };
    }

    if (query.name) {
      where.name = {
        contains: query.name,
        mode: 'insensitive',
      };
    }

    if (query.type_document) {
      where.type_document = {
        contains: query.type_document,
        mode: 'insensitive',
      };
    }

    if (query.email) {
      where.email = {
        contains: query.email,
        mode: 'insensitive',
      };
    }

    if (query.phone) {
      where.phone = {
        contains: query.phone,
        mode: 'insensitive',
      };
    }

    if (query.city) {
      where.city = {
        contains: query.city,
        mode: 'insensitive',
      };
    }

    if (query.localId) {
      where.local = {
        is: {
          name: {
            contains: query.localId,
            mode: 'insensitive',
          },
        },
      };
    }

    if (query.status) {
      const normalizedStatus = query.status.toUpperCase();

      if (Object.values(Status).includes(normalizedStatus as Status)) {
        where.status = normalizedStatus as Status;
      }
    }

    const customerWhere = {
      ...where,
      NOT: {
        document: '222222222222',
      },
    };

    // ==========================
    // LISTAR TODOS (SELECTS)
    // ==========================
    if (isAll) {
      const items = await this.prisma.customer.findMany({
        where: customerWhere,
        orderBy: {
          name: 'asc',
        },
        select: {
          id: true,
          name: true,
          document: true,
        },
      });

      const consumidorFinal = await this.prisma.customer.findFirst({
        where: {
          document: '222222222222',
          companyId: user.companyId,
        },
        select: {
          id: true,
          name: true,
          document: true,
        },
      });

      return {
        success: true,
        data: consumidorFinal ? [consumidorFinal, ...items] : items,
      };
    }

    // ==========================
    // PAGINADO
    // ==========================
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where: customerWhere,
        include: {
          local: true,
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),

      this.prisma.customer.count({
        where: customerWhere,
      }),
    ]);

    const consumidorFinal = await this.prisma.customer.findFirst({
      where: {
        document: '222222222222',
        companyId: user.companyId,
      },
      include: {
        local: true,
      },
    });

    const data =
      consumidorFinal && page === 1 ? [consumidorFinal, ...items] : items;

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number, user: any) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
      include: { local: true },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return {
      success: true,
      message: 'Cliente obtenido correctamente',
      data: customer,
    };
  }

  async create(dto: CreateCustomerDto, user: any) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);

    let localId: number | null = null;

    if (localIds === null) {
      if (!dto.localId) {
        throw new BadRequestException('Debes indicar el local del cliente');
      }
      localId = dto.localId;
    } else if (localIds.length === 1) {
      localId = localIds[0];
    } else if (localIds.length > 1) {
      if (!dto.localId) {
        throw new BadRequestException('Debes indicar el local del cliente');
      }

      if (!localIds.includes(dto.localId)) {
        throw new ForbiddenException('Local no permitido');
      }

      localId = dto.localId;
    } else {
      throw new ForbiddenException('No tienes locales');
    }

    const { localId: _, ...rest } = dto;

    const customer = await this.prisma.customer.create({
      data: {
        ...rest,

        company: {
          connect: { id: user.companyId },
        },

        ...(localId && {
          local: {
            connect: { id: localId },
          },
        }),
      },
    });

    return {
      success: true,
      message: 'Cliente creado correctamente',
      data: customer,
    };
  }

  async update(id: number, dto: UpdateCustomerDto, user: any) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    if (
      localIds !== null &&
      (!customer.localId || !localIds.includes(customer.localId))
    ) {
      throw new ForbiddenException('No tienes permiso');
    }

    const { localId, ...rest } = dto;

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        ...rest,

        ...(localId !== undefined && {
          local: localId ? { connect: { id: localId } } : { disconnect: true },
        }),
      },
    });

    return {
      success: true,
      message: 'Cliente actualizado correctamente',
      data: updated,
    };
  }

  async remove(id: number, user: any) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    await this.prisma.customer.update({
      where: { id },
      data: { status: Status.ELIMINADO },
    });

    return {
      success: true,
      message: 'Cliente eliminado correctamente',
    };
  }
}
