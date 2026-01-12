import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { hasRole } from 'src/common/role-check.util';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
  ) {}

  // Actualizar avatar
  async updateAvatar(userId: number, file: Express.Multer.File) {
    const upload = await this.cloudinaryService.uploadImage(
      file,
      'avatars', // carpeta
      `user_${userId}`, // publicId fijo
    );

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: upload.url },
    });

    return {
      success: true,
      message: 'Avatar actualizado correctamente',
      data: updatedUser,
    };
  }

  // Eliminar Avatar
  async deleteAvatar(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (user.avatar) {
      try {
        // Eliminamos directamente con el publicId que usamos al subir
        await this.cloudinaryService.deleteImage(`avatars/user_${userId}`);
      } catch (err) {
        console.error('Error eliminando imagen de Cloudinary:', err);
        throw new Error('No se pudo eliminar la imagen en Cloudinary');
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: { avatar: null },
      });
    }

    return {
      success: true,
      message: 'Avatar eliminado correctamente',
    };
  }

  // Obtener todos los usuarios (solo SUPER_ADMIN y ADMIN)
  async getUsers(user: any) {
    if (
      !hasRole(user.role, [
        Role.SUPER_ADMIN,
        Role.ADMIN,
        Role.COORDINADOR,
        Role.ASESOR,
      ])
    ) {
      throw new ForbiddenException('No tienes permisos');
    }

    let where: any = {};

    // SUPER_ADMIN y ADMIN → ven todos
    if (hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      // sin filtros
    }

    // COORDINADOR (manager) → usuarios de sus locales
    else if (user.role === Role.COORDINADOR) {
      // Traemos sus locales administrados
      const dbUser = await this.prisma.user.findUnique({
        where: { id: user.userId },
        include: { managedLocals: true },
      });

      if (!dbUser || dbUser.managedLocals.length === 0) {
        return {
          success: true,
          message: 'No tienes locales asignados',
          data: [],
        };
      }

      const localIds = dbUser.managedLocals.map((l) => l.id);

      where = {
        localId: { in: localIds },
      };
    }

    // ASESOR → solo se ve a sí mismo
    else if (user.role === Role.ASESOR) {
      where = { id: user.userId };
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        local: true,
        managedLocals: true,
      },
      orderBy: { name: 'asc' },
    });

    return {
      success: true,
      message: 'Usuarios obtenidos correctamente',
      data: users,
    };
  }

  async getUserId(id: number, requester?: { role: Role; userId: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        local: true,
        managedLocals: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con id ${id} no fue encontrado`);
    }

    // PROTECCIÓN SUPER_ADMIN
    if (
      user.role === Role.SUPER_ADMIN &&
      requester?.role !== Role.SUPER_ADMIN
    ) {
      throw new ForbiddenException('No tienes permiso para ver este usuario');
    }

    // ASESOR → solo puede verse a sí mismo
    if (requester?.role === Role.ASESOR && requester.userId !== id) {
      throw new ForbiddenException('No tienes permiso para ver este usuario');
    }

    // COORDINADOR → solo usuarios de sus locales
    if (requester?.role === Role.COORDINADOR) {
      const dbRequester = await this.prisma.user.findUnique({
        where: { id: requester.userId },
        include: { managedLocals: true },
      });

      const managedLocalIds = dbRequester?.managedLocals.map((l) => l.id) || [];

      if (!user.localId || !managedLocalIds.includes(user.localId)) {
        throw new ForbiddenException(
          'No tienes permiso para ver usuarios de otros locales',
        );
      }
    }

    const { password, ...safeData } = user;

    return {
      success: true,
      message: 'Usuario obtenido',
      data: {
        ...safeData,
        birthdate: formatDate(user.birthdate),
      },
    };
  }

  // Crear usuario (solo SUPER_ADMIN y ADMIN)
  async createUser(dto: CreateUserDto, user?: any) {
    if (user && !hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException(`El email ${dto.email} ya está registrado`);
    }

    if (dto.localId) {
      const local = await this.prisma.local.findUnique({
        where: { id: dto.localId },
      });
      if (!local) {
        throw new NotFoundException('El local asignado no existe');
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name?.trim(),
        birthdate: dto.birthdate ? new Date(dto.birthdate) : null,
        phone: dto.phone?.trim(),
        address: dto.address?.trim(),
        city: dto.city?.trim(),
        department: dto.department?.trim(),
        document: dto.document?.trim(),
        role: dto.role ?? Role.ASESOR,
        status: dto.status ?? 'ACTIVO',
        localId: dto.localId ?? null,
      },
    });

    return {
      success: true,
      message: 'Usuario creado exitosamente',
      data: created,
    };
  }

  // Actualizar usuario (propio o ADMIN)
  async updateUser(id: number, dto: UpdateUserDto, user?: any) {
    const found = await this.prisma.user.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException(`Usuario con id ${id} no fue encontrado`);
    }

    if (user && hasRole(user.role, [Role.ASESOR]) && user.userId !== id) {
      throw new ForbiddenException(
        'No tienes permiso para modificar este usuario',
      );
    }

    if (dto.birthdate) dto.birthdate = new Date(dto.birthdate as any) as any;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...dto,
        password: dto.password
          ? await bcrypt.hash(dto.password, 10)
          : found.password,
        avatar: dto.avatar ?? found.avatar,
      },
    });

    return { success: true, message: 'Usuario actualizado', data: updated };
  }

  // Eliminar usuario (solo ADMIN)
  async deleteUser(id: number, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.user.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException(`Usuario con id ${id} no fue encontrado`);
    }

    await this.prisma.user.delete({ where: { id } });

    return { success: true, message: 'Usuario eliminado correctamente' };
  }

  // Alternar rol (solo ADMIN)
  async updateUserSegment(id: number, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.user.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException(`Usuario con id ${id} no fue encontrado`);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        role: found.role === Role.SUPER_ADMIN ? Role.ASESOR : Role.SUPER_ADMIN,
      },
    });

    return { success: true, message: 'Rol actualizado', data: updated };
  }

  // Obtener roles del enum de Prisma
  async getRoles() {
    const roles = Object.values(Role).map((role) => ({
      id: role,
      name: role.replace('_', ' '),
    }));

    return {
      success: true,
      message: 'Roles obtenidos correctamente',
      data: roles,
    };
  }
}

// Utilidad local
function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().split('T')[0]; // yyyy-mm-dd
}
