import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { Role } from '@prisma/client';
import { hasRole } from 'src/common/role-check.util';

@Injectable()
export class BrandsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const brands = await this.prisma.brand.findMany({
      orderBy: { name: 'asc' },
    });

    return {
      success: true,
      message: 'Marcas obtenidas correctamente',
      data: brands,
    };
  }

  async findOne(id: number) {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
    });

    if (!brand) {
      throw new NotFoundException(`Marca con ID ${id} no encontrada`);
    }

    return {
      success: true,
      message: 'Marca obtenida correctamente',
      data: brand,
    };
  }

  async create(dto: CreateBrandDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const brand = await this.prisma.brand.create({
      data: dto,
    });

    return {
      success: true,
      message: 'Marca creada correctamente',
      data: brand,
    };
  }

  async update(id: number, dto: UpdateBrandDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.brand.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException(`Marca con ID ${id} no encontrada`);
    }

    const updated = await this.prisma.brand.update({
      where: { id },
      data: dto,
    });

    return {
      success: true,
      message: 'Marca actualizada correctamente',
      data: updated,
    };
  }

  async remove(id: number, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.brand.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException(`Marca con ID ${id} no encontrada`);
    }

    await this.prisma.brand.delete({ where: { id } });

    return {
      success: true,
      message: 'Marca eliminada correctamente',
    };
  }
}
