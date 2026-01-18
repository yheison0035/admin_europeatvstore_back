import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateLocalDto } from './dto/create-local.dto';
import { UpdateLocalDto } from './dto/update-local.dto';
import { Role } from '@prisma/client';
import { hasRole } from 'src/common/role-check.util';

@Injectable()
export class LocalsService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: any) {
    let where: any = {};

    // Roles con acceso total
    if (
      [Role.SUPER_ADMIN, Role.COORDINADOR, Role.AUXILIAR].includes(user.role)
    ) {
      // sin filtro
    }
    // ADMIN → solo locales que administra
    else if (user.role === Role.ADMIN) {
      where.managerId = user.id;
    }
    // Usuario con local asignado
    else if (user.localId) {
      where.id = user.localId;
    }
    // Sin acceso
    else {
      where.id = -1;
    }

    const locals = await this.prisma.local.findMany({
      where,
      include: {
        users: true,
        manager: true,
      },
      orderBy: { name: 'asc' },
    });

    return {
      success: true,
      message: 'Locales obtenidos correctamente',
      data: locals,
    };
  }

  async findOne(id: number, user: any) {
    const local = await this.prisma.local.findUnique({
      where: { id },
      include: {
        users: true,
        manager: true,
      },
    });

    if (!local) {
      throw new NotFoundException(`Local con ID ${id} no encontrado`);
    }

    // Roles globales → permitido
    if (
      [Role.SUPER_ADMIN, Role.COORDINADOR, Role.AUXILIAR].includes(user.role)
    ) {
      return {
        success: true,
        message: 'Local obtenido correctamente',
        data: local,
      };
    }

    // ADMIN → solo si es manager
    if (user.role === Role.ADMIN && local.managerId === user.id) {
      return {
        success: true,
        message: 'Local obtenido correctamente',
        data: local,
      };
    }

    // Usuario normal → solo su local
    if (user.localId && user.localId === local.id) {
      return {
        success: true,
        message: 'Local obtenido correctamente',
        data: local,
      };
    }

    throw new ForbiddenException('No tienes acceso a este local');
  }

  async create(dto: CreateLocalDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const local = await this.prisma.local.create({
      data: {
        ...dto,
        managerId: dto.managerId ?? null,
      },
    });

    return {
      success: true,
      message: 'Local creado correctamente',
      data: local,
    };
  }

  async update(id: number, dto: UpdateLocalDto, user: any) {
    const found = await this.prisma.local.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException(`Local con ID ${id} no encontrado`);
    }

    // Roles globales → OK
    if (
      ![Role.SUPER_ADMIN, Role.COORDINADOR, Role.AUXILIAR].includes(user.role)
    ) {
      // ADMIN → solo sus locales
      if (user.role === Role.ADMIN && found.managerId !== user.id) {
        throw new ForbiddenException('No puedes modificar este local');
      }
    }

    const data: any = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.address !== undefined && { address: dto.address }),
      ...(dto.city !== undefined && { city: dto.city }),
      ...(dto.department !== undefined && { department: dto.department }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.status !== undefined && { status: dto.status }),
    };

    if (dto.managerId !== undefined) {
      const manager = await this.prisma.user.findUnique({
        where: { id: dto.managerId },
      });

      if (!manager) {
        throw new NotFoundException(
          'El usuario asignado como encargado no existe',
        );
      }

      data.manager = { connect: { id: dto.managerId } };
    }

    const updated = await this.prisma.local.update({
      where: { id },
      data,
      include: {
        users: true,
        manager: true,
      },
    });

    return {
      success: true,
      message: 'Local actualizado correctamente',
      data: updated,
    };
  }

  async remove(id: number, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.local.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException(`Local con ID ${id} no encontrado`);
    }

    await this.prisma.local.delete({ where: { id } });

    return {
      success: true,
      message: 'Local eliminado correctamente',
    };
  }
}
