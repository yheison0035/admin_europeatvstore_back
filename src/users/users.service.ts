import {
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Role, Status } from '@prisma/client';
import { PrismaService } from '@/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { hasRole } from '@/common/role-check.util';
import { CloudinaryService } from '@/cloudinary/cloudinary.service';
import { getAccessibleLocalIds } from '@/common/access-locals.util';
import { applyLocalFilter } from '@/common/local-filter.util';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async updateAvatar(userId: number, file: Express.Multer.File, user?: any) {
    const found = await this.prisma.user.findFirst({
      where: {
        id: userId,
        companyId: user.companyId,
      },
    });

    if (!found) throw new NotFoundException('Usuario no encontrado');

    const upload = await this.cloudinaryService.uploadImage(
      file,
      'avatars',
      `user_${userId}`,
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

  async deleteAvatar(userId: number, user?: any) {
    const found = await this.prisma.user.findFirst({
      where: {
        id: userId,
        companyId: user.companyId,
      },
    });

    if (!found) throw new NotFoundException('Usuario no encontrado');

    if (found.avatar) {
      await this.cloudinaryService.deleteImage(`avatars/user_${userId}`);

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

  async findAllPaginated(user: any, query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const where: any = {
      companyId: user.companyId,
    };

    if (user.role !== Role.SUPER_ADMIN) {
      where.status = Status.ACTIVO;
    }

    applyLocalFilter(where, user, localIds);

    if (query.role) {
      const role = query.role.toUpperCase();
      if (Object.values(Role).includes(role)) {
        where.role = role;
      }
    }

    if (query.name) {
      where.name = { contains: query.name, mode: 'insensitive' };
    }

    if (query.email) {
      where.email = { contains: query.email, mode: 'insensitive' };
    }

    if (query.document) {
      where.document = { contains: query.document, mode: 'insensitive' };
    }

    if (query.phone) {
      where.phone = { contains: query.phone, mode: 'insensitive' };
    }

    if (query.address) {
      where.address = { contains: query.address, mode: 'insensitive' };
    }

    // El filtro de estado solo aplica para SUPER_ADMIN; el resto ya está
    // restringido a usuarios ACTIVO más arriba.
    if (query.status && user.role === Role.SUPER_ADMIN) {
      const normalizedStatus = query.status.toUpperCase();
      if (Object.values(Status).includes(normalizedStatus as Status)) {
        where.status = normalizedStatus as Status;
      }
    }

    if (query.managedLocals) {
      where.managedLocals = {
        some: {
          name: { contains: query.managedLocals, mode: 'insensitive' },
        },
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: {
          local: true,
          managedLocals: true,
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      success: true,
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserId(id: number, requester?: any) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        ...(requester?.companyId && {
          companyId: requester.companyId,
        }),
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            logo: true,
            nit: true,
            email: true,
            phone: true,
            status: true,
            type: true,
          },
        },
        local: true,
        managedLocals: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (requester?.id === user.id) {
      return {
        success: true,
        data: sanitizeUser(user),
      };
    }

    const localIds = await getAccessibleLocalIds(this.prisma, requester);

    if (localIds === null) {
      return {
        success: true,
        data: sanitizeUser(user),
      };
    }

    if (!user.localId || !localIds.includes(user.localId)) {
      throw new ForbiddenException('No tienes permiso');
    }

    return {
      success: true,
      data: sanitizeUser(user),
    };
  }

  async createUser(dto: CreateUserDto, user?: any) {
    if (user && !hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (exists) throw new ConflictException('Email ya registrado');

    if (dto.localId) {
      const local = await this.prisma.local.findFirst({
        where: {
          id: dto.localId,
          companyId: user.companyId,
        },
      });

      if (!local) throw new ForbiddenException('Local inválido');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const created = await this.prisma.user.create({
      data: {
        ...dto,
        password: hashedPassword,
        companyId: user.companyId,
      },
    });

    return {
      success: true,
      message: 'Usuario creado',
      data: created,
    };
  }

  async updateUser(id: number, dto: UpdateUserDto, user?: any) {
    const found = await this.prisma.user.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!found) throw new NotFoundException('Usuario no encontrado');

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...dto,
        password: dto.password
          ? await bcrypt.hash(dto.password, 10)
          : found.password,
      },
    });

    return { success: true, data: updated };
  }

  async deleteUser(id: number, user: any) {
    const found = await this.prisma.user.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!found) throw new NotFoundException('Usuario no encontrado');

    await this.prisma.user.delete({ where: { id } });

    return { success: true, message: 'Usuario eliminado' };
  }

  // Nuevo método para obtener usuarios por rol
  async getUsersByRole(user: any, query: any) {
    const where: any = {
      status: Status.ACTIVO,
    };

    // OBLIGATORIO: localId
    const localId = Number(query.localId);

    if (!localId || isNaN(localId)) {
      throw new BadRequestException('localId es obligatorio');
    }

    // =========================
    // FILTRO PRINCIPAL
    // =========================
    where.localId = localId;

    if (user?.companyId) {
      where.companyId = user.companyId;
    }

    if (query.role) {
      where.role = query.role.toUpperCase();
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        role: true,
        avatar: true,
      },
      orderBy: { name: 'asc' },
    });
  }
}

export function sanitizeUser(user: any) {
  const { password, ...rest } = user;

  return {
    ...rest,
    company: user.company ?? null,
  };
}
