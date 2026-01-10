import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { Role } from '@prisma/client';
import { hasRole } from 'src/common/role-check.util';

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const providers = await this.prisma.provider.findMany({
      orderBy: { name: 'asc' },
    });

    return {
      success: true,
      message: 'Proveedores obtenidos correctamente',
      data: providers,
    };
  }

  async findOne(id: number) {
    const provider = await this.prisma.provider.findUnique({
      where: { id },
    });

    if (!provider) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }

    return {
      success: true,
      message: 'Proveedor obtenido correctamente',
      data: provider,
    };
  }

  async create(dto: CreateProviderDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const provider = await this.prisma.provider.create({
      data: dto,
    });

    return {
      success: true,
      message: 'Proveedor creado correctamente',
      data: provider,
    };
  }

  async update(id: number, dto: UpdateProviderDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.provider.findUnique({
      where: { id },
    });

    if (!found) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }

    const updated = await this.prisma.provider.update({
      where: { id },
      data: dto,
    });

    return {
      success: true,
      message: 'Proveedor actualizado correctamente',
      data: updated,
    };
  }

  async remove(id: number, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.provider.findUnique({
      where: { id },
    });

    if (!found) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }

    await this.prisma.provider.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Proveedor eliminado correctamente',
    };
  }
}
