import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Status } from '@prisma/client';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async findAllPaginated(user: any, query: any) {
    const isAll = query.all === 'true' || query.all === true;

    const where: any = {
      status: { not: Status.ELIMINADO },
      companyId: user.companyId,
    };

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

    // Excluye SOLO al consumidor final. Se incluye document NULL, porque
    // `document <> '222...'` en SQL descarta los NULL sin querer.
    const customerWhere = {
      ...where,
      OR: [{ document: null }, { document: { not: '222222222222' } }],
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
    // El cliente es global por empresa, pero guardamos el "local de registro"
    // (de dónde viene): el del contexto (factura/formulario) o, si no llega,
    // el local del usuario que lo crea. Es solo informativo, no restringe.
    let localId: number | null = dto.localId || user.localId || null;

    if (localId) {
      const local = await this.prisma.local.findFirst({
        where: { id: localId, companyId: user.companyId },
        select: { id: true },
      });
      localId = local ? local.id : null; // si no es de la empresa, se ignora
    }

    const { localId: _, ...rest } = dto;

    const customer = await this.prisma.customer.create({
      data: {
        ...rest,
        // Valores por defecto cuando se crea rápido (modal): cédula, un
        // documento dinámico no repetido y ubicación Itagüí, Antioquia.
        type_document: rest.type_document || 'CC',
        document: rest.document || String(Date.now()),
        department: rest.department || 'ANTIOQUIA',
        city: rest.city || 'ITAGUI',

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

    if (customer.companyId !== user.companyId) {
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
