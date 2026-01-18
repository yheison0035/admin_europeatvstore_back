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
import { getAccessibleLocalIds } from 'src/common/access-locals.util';

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
    const localIds = await getAccessibleLocalIds(this.prisma, user);

    let where: any = {};

    // Roles globales → todos
    if (localIds === null) {
      // sin filtro
    }
    // Sin acceso a locales → solo él mismo
    else if (localIds.length === 0) {
      where = { id: user.id };
    }
    // Usuarios de locales permitidos + usuario autenticado
    else {
      where = {
        OR: [
          { localId: { in: localIds } }, // usuarios del/los local(es)
          { id: user.id }, // siempre incluir al solicitante
        ],
      };
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

  async getUserId(
    id: number,
    requester?: { role: Role; id: number; localId?: number },
  ) {
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

    /**
     * SIEMPRE permitir que el usuario se vea a sí mismo
     */
    if (requester && requester.id === user.id) {
      return {
        success: true,
        message: 'Usuario obtenido',
        data: sanitizeUser(user),
      };
    }

    const localIds = await getAccessibleLocalIds(this.prisma, requester);

    /**
     * Roles con acceso global
     */
    if (localIds === null) {
      return {
        success: true,
        message: 'Usuario obtenido',
        data: sanitizeUser(user),
      };
    }

    /**
     * Validar acceso por local
     */
    if (!user.localId || !localIds.includes(user.localId)) {
      throw new ForbiddenException('No tienes permiso para ver este usuario');
    }

    return {
      success: true,
      message: 'Usuario obtenido',
      data: sanitizeUser(user),
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

    if (dto.localId) {
      const localIds = await getAccessibleLocalIds(this.prisma, user);

      if (localIds !== null && !localIds.includes(dto.localId)) {
        throw new ForbiddenException(
          'No puedes crear usuarios en un local que no administras',
        );
      }
    }

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

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    if (
      localIds !== null &&
      found.localId &&
      !localIds.includes(found.localId)
    ) {
      throw new ForbiddenException(
        'No tienes permiso para modificar usuarios de otro local',
      );
    }

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
}

function sanitizeUser(user: any) {
  const { password, ...safe } = user;
  return {
    ...safe,
    birthdate: user.birthdate
      ? user.birthdate.toISOString().split('T')[0]
      : null,
  };
}
