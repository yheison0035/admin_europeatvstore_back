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
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.COORDINADOR])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const locals = await this.prisma.local.findMany({
      include: {
        user: true,
      },
      orderBy: { name: 'asc' },
    });

    return {
      success: true,
      message: 'Locales obtenidos correctamente',
      data: locals,
    };
  }

  async findOne(id: number, requester: any) {
    const local = await this.prisma.local.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });

    if (!local) {
      throw new NotFoundException(`Local con ID ${id} no encontrado`);
    }

    // ADMIN solo puede ver su propio local
    if (requester.role === Role.ADMIN && local.userId !== requester.userId) {
      throw new ForbiddenException('No tienes acceso a este local');
    }

    return {
      success: true,
      message: 'Local obtenido correctamente',
      data: local,
    };
  }

  async create(dto: CreateLocalDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const local = await this.prisma.local.create({
      data: {
        ...dto,
        userId: dto.userId ?? null,
      },
    });

    return {
      success: true,
      message: 'Local creado correctamente',
      data: local,
    };
  }

  async update(id: number, dto: UpdateLocalDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.local.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException(`Local con ID ${id} no encontrado`);
    }

    const updated = await this.prisma.local.update({
      where: { id },
      data: dto,
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
