import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { getAccessibleLocalIds } from 'src/common/access-locals.util';
import { Status } from '@prisma/client';

@Injectable()
export class CustomersService {
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
        where.document = '222222222222';
      } else {
        where.localId = { in: localIds };
      }
    }

    if (query.type_document) {
      where.type_document = {
        contains: query.type_document,
        mode: 'insensitive',
      };
    }

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
        name: {
          contains: query.localId,
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
      this.prisma.customer.findMany({
        where: {
          ...where,
          NOT: { document: '222222222222' },
        },
        include: { local: true },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({
        where: {
          ...where,
          NOT: { document: '222222222222' },
        },
      }),
    ]);

    const consumidorFinal = await this.prisma.customer.findFirst({
      where: { document: '222222222222' },
      include: { local: true },
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

  // OBTENER UNO
  async findOne(id: number, user: any) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { local: true },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    if (
      customer.document !== '222222222222' &&
      localIds !== null &&
      (!customer.localId || !localIds.includes(customer.localId))
    ) {
      throw new ForbiddenException(
        'No tienes permiso para ver clientes de otro local',
      );
    }

    return {
      success: true,
      message: 'Cliente obtenido correctamente',
      data: customer,
    };
  }

  // CREAR CLIENTE (SE ASIGNA AUTOMÁTICAMENTE AL LOCAL DEL USUARIO)
  async create(dto: CreateCustomerDto, user: any) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);

    let localId: number | null = null;

    // Roles globales → deben enviar localId
    if (localIds === null) {
      if (!dto.localId) {
        throw new BadRequestException('Debes indicar el local del cliente');
      }
      localId = dto.localId;
    }
    // Usuario con un solo local accesible
    else if (localIds.length === 1) {
      localId = localIds[0];
    }
    // Usuario con varios locales → debe elegir uno válido
    else if (localIds.length > 1) {
      if (!dto.localId) {
        throw new BadRequestException('Debes indicar el local del cliente');
      }

      if (!localIds.includes(dto.localId)) {
        throw new ForbiddenException(
          'No puedes crear clientes en un local que no administras',
        );
      }

      localId = dto.localId;
    }
    // Sin locales
    else {
      throw new ForbiddenException(
        'No tienes locales asignados para crear clientes',
      );
    }

    const { localId: _ignored, ...cleanDto } = dto;

    const customer = await this.prisma.customer.create({
      data: {
        ...cleanDto,
        local: { connect: { id: localId } },
      },
    });

    return {
      success: true,
      message: 'Cliente creado correctamente',
      data: customer,
    };
  }

  // ACTUALIZAR CLIENTE
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
      throw new ForbiddenException(
        'No tienes permiso para modificar clientes de otro local',
      );
    }

    const { localId: _ignored, ...cleanDto } = dto;

    const updated = await this.prisma.customer.update({
      where: { id },
      data: cleanDto,
    });

    return {
      success: true,
      message: 'Cliente actualizado correctamente',
      data: updated,
    };
  }

  // ELIMINAR
  async remove(id: number, user: any) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    if (
      localIds !== null &&
      (!customer.localId || !localIds.includes(customer.localId))
    ) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar clientes de otro local',
      );
    }

    await this.prisma.customer.delete({ where: { id } });

    return {
      success: true,
      message: 'Cliente eliminado correctamente',
    };
  }
}
