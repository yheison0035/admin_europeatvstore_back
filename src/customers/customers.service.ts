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

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: any) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);

    let baseWhere: any = {};

    // Acceso global
    if (localIds === null) {
      baseWhere = {};
    }
    // Sin locales → solo consumidor final
    else if (localIds.length === 0) {
      baseWhere = {};
    }
    // Locales asignados
    else {
      baseWhere = {
        localId: { in: localIds },
      };
    }

    // CONSUMIDOR FINAL (SIN LOCAL)
    const consumidorFinal = await this.prisma.customer.findFirst({
      where: {
        document: '222222222222',
      },
      include: { local: true },
    });

    // RESTO DE CLIENTES
    const others = await this.prisma.customer.findMany({
      where: {
        ...baseWhere,
        NOT: { document: '222222222222' },
      },
      include: { local: true },
      orderBy: { createdAt: 'desc' },
    });

    const customers = consumidorFinal ? [consumidorFinal, ...others] : others;

    return {
      success: true,
      message: 'Clientes obtenidos correctamente',
      data: customers,
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
