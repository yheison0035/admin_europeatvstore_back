import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Role, Status } from '@prisma/client';
import { hasRole } from 'src/common/role-check.util';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN, Role.COORDINADOR])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const categories = await this.prisma.category.findMany({
      where: {
        status: {
          not: Status.ELIMINADO,
        },
      },
      orderBy: { name: 'asc' },
    });

    return {
      success: true,
      message: 'Categorías obtenidas correctamente',
      data: categories,
    };
  }

  async findOne(id: number, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN, Role.COORDINADOR])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category || category.status === Status.ELIMINADO) {
      throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    }

    return {
      success: true,
      message: 'Categoría obtenida correctamente',
      data: category,
    };
  }

  async create(dto: CreateCategoryDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status ?? Status.ACTIVO,
      },
    });

    return {
      success: true,
      message: 'Categoría creada correctamente',
      data: category,
    };
  }

  async update(id: number, dto: UpdateCategoryDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!found || found.status === Status.ELIMINADO) {
      throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: dto,
    });

    return {
      success: true,
      message: 'Categoría actualizada correctamente',
      data: updated,
    };
  }

  async remove(id: number, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!found || found.status === Status.ELIMINADO) {
      throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    }

    await this.prisma.category.update({
      where: { id },
      data: {
        status: Status.ELIMINADO,
      },
    });

    return {
      success: true,
      message: 'Categoría eliminada correctamente',
    };
  }
}
