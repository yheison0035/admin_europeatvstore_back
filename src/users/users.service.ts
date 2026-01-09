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
import { v2 as Cloudinary } from 'cloudinary';
import { hasRole } from 'src/common/role-check.util';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    @Inject('CLOUDINARY') private cloudinary: typeof Cloudinary,
  ) {}

  // Actualizar avatar
  async updateAvatar(userId: number, file: Express.Multer.File) {
    return new Promise(async (resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        {
          folder: 'avatars',
          public_id: `user_${userId}`,
          overwrite: true,
        },
        async (error, uploaded) => {
          if (error) return reject(error);

          try {
            const updatedUser = await this.prisma.user.update({
              where: { id: userId },
              data: { avatar: uploaded?.secure_url },
            });

            resolve(updatedUser);
          } catch (err) {
            reject(err);
          }
        },
      );

      uploadStream.end(file.buffer);
    });
  }

  // Eliminar Avatar
  async deleteAvatar(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (user.avatar) {
      const publicId = this.extractPublicIdFromUrl(user.avatar);

      if (publicId) {
        try {
          await this.cloudinary.uploader.destroy(publicId);
        } catch (err) {
          console.error('Error eliminando imagen de Cloudinary:', err);
          throw new Error('No se pudo eliminar la imagen en Cloudinary');
        }
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

  private extractPublicIdFromUrl(url: string): string | null {
    try {
      const parts = url.split('/');
      const filename = parts[parts.length - 1];
      const folder = parts[parts.length - 2];
      const publicId = `${folder}/${filename.split('.')[0]}`;
      return publicId;
    } catch {
      return null;
    }
  }

  // Obtener todos los usuarios (solo SUPER_ADMIN y ADMIN)
  async getUsers(user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN, Role.COORDINADOR])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const users = await this.prisma.user.findMany();
    return {
      success: true,
      message: 'Usuarios obtenidos correctamente',
      data: users,
    };
  }

  // Obtener un usuario por ID
  async getUserId(id: number, requester?: { role: Role; userId: number }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${id} no fue encontrado`);
    }

    if (
      user.role === Role.SUPER_ADMIN &&
      requester?.role !== Role.SUPER_ADMIN
    ) {
      throw new ForbiddenException('No tienes permiso para ver este usuario');
    }

    if (requester?.role === Role.ASESOR && requester.userId !== id) {
      throw new ForbiddenException('No tienes permiso para ver este usuario');
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
}

// Utilidad local
function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().split('T')[0]; // yyyy-mm-dd
}
