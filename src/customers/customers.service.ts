import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Role } from '@prisma/client';
import { hasRole } from 'src/common/role-check.util';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  // OBTENER CLIENTES SEGÚN ROL
  async findAll(user: any) {
    const isGlobal = hasRole(user.role, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.COORDINADOR,
      Role.AUXILIAR,
    ]);

    const where: any = {};

    if (!isGlobal) {
      if (!user.localId) {
        throw new ForbiddenException(
          'Debes tener un local asignado para ver clientes',
        );
      }
      where.localId = user.localId;
    }

    const customers = await this.prisma.customer.findMany({
      where,
      include: { local: true },
      orderBy: { createdAt: 'desc' },
    });

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

    const isGlobal = hasRole(user.role, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.COORDINADOR,
      Role.AUXILIAR,
    ]);

    if (!isGlobal && customer.localId !== user.localId) {
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
    let localId: number | null = null;

    // Usuario normal con un solo local
    if (user.localId) {
      localId = user.localId;
    } else {
      // Usuario manager
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
        include: { managedLocals: true },
      });

      if (!dbUser) {
        throw new ForbiddenException('Usuario no encontrado');
      }

      if (dbUser.managedLocals.length === 0) {
        throw new ForbiddenException(
          'No tienes locales asignados para crear clientes',
        );
      }

      // Un solo local → automático
      if (dbUser.managedLocals.length === 1) {
        localId = dbUser.managedLocals[0].id;
      }

      // Varios locales → debe elegir
      else {
        if (!dto.localId) {
          throw new ForbiddenException(
            'Tienes múltiples locales asignados. Debes indicar el local del cliente.',
          );
        }

        const allowedIds = dbUser.managedLocals.map((l) => l.id);

        if (!allowedIds.includes(dto.localId)) {
          throw new ForbiddenException(
            'No puedes crear clientes en un local que no administras',
          );
        }

        localId = dto.localId;
      }
    }

    // Protección de TypeScript y lógica
    if (!localId) {
      throw new ForbiddenException(
        'No se pudo determinar el local para crear el cliente',
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

    const isGlobal = hasRole(user.role, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.COORDINADOR,
      Role.AUXILIAR,
    ]);

    if (!isGlobal && customer.localId !== user.localId) {
      throw new ForbiddenException(
        'No tienes permiso para modificar clientes de otro local',
      );
    }

    // QUITAMOS localId DEL DTO
    const { localId: _ignored, ...cleanDto } = dto;

    const data: any = {
      ...cleanDto,
    };

    // (Opcional) Si en el futuro permites cambiar de local:
    if (dto.localId) {
      data.local = { connect: { id: dto.localId } };
    }

    const updated = await this.prisma.customer.update({
      where: { id },
      data,
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

    const isGlobal = hasRole(user.role, [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.COORDINADOR,
      Role.AUXILIAR,
    ]);

    if (!isGlobal && customer.localId !== user.localId) {
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
