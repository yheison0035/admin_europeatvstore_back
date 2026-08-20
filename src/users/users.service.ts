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
import { PlanLimitsService } from '@/common/plan-limits.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
    private planLimits: PlanLimitsService,
  ) {}

  // LISTADO GLOBAL (todos los usuarios de todas las empresas) — plataforma
  async findAllGlobal(user: any, query: any) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = { status: { not: Status.ELIMINADO } };

    if (query.name) {
      where.name = { contains: query.name, mode: 'insensitive' };
    }
    if (query.email) {
      where.email = { contains: query.email, mode: 'insensitive' };
    }
    if (query.role) {
      where.role = query.role;
    }
    if (query.companyId) {
      where.companyId = Number(query.companyId);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          company: { select: { id: true, name: true } },
          local: { select: { name: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
            // El plan gobierna qué funciones/módulos ve la empresa.
            plan: true,
            // El CRM las usa para mostrar (o no) el módulo de tienda online.
            websiteEnabled: true,
            domain: true,
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

    // Anti escalada de privilegios: nadie crea un SUPER_PLATFORM_ADMIN desde
    // aquí; y un ADMIN no puede crear ADMIN ni SUPER_ADMIN (solo el SUPER_ADMIN
    // de la empresa puede crear administradores).
    if (user) {
      const requested = dto.role ?? Role.ASESOR;
      if (requested === Role.SUPER_PLATFORM_ADMIN) {
        throw new ForbiddenException('No puedes asignar el rol de plataforma.');
      }
      if (
        user.role === Role.ADMIN &&
        (requested === Role.SUPER_ADMIN || requested === Role.ADMIN)
      ) {
        throw new ForbiddenException(
          'No tienes permiso para asignar el rol de administrador.',
        );
      }

      // Solo puede haber UN SUPER_ADMIN por empresa (el administrador principal
      // que se crea con la empresa). No se permiten más.
      if (requested === Role.SUPER_ADMIN && user.companyId) {
        const yaExiste = await this.prisma.user.findFirst({
          where: {
            companyId: user.companyId,
            role: Role.SUPER_ADMIN,
            status: { not: Status.ELIMINADO },
          },
          select: { id: true },
        });
        if (yaExiste) {
          throw new ForbiddenException(
            'Ya existe el administrador principal de la empresa. Solo puede haber uno.',
          );
        }
      }
    }

    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (exists) throw new ConflictException('Email ya registrado');

    // Límite de usuarios según el plan de la empresa.
    await this.planLimits.assertCanCreate(user?.companyId, 'users');

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

  // Autoservicio: cualquier usuario autenticado edita SUS propios datos
  // personales (incluida la contraseña). Nunca puede cambiar su rol, correo,
  // estado, local ni empresa: esos campos se ignoran aunque lleguen en el body.
  async updateOwnProfile(user: any, dto: any) {
    const found = await this.prisma.user.findFirst({
      where: { id: user.id },
    });

    if (!found) throw new NotFoundException('Usuario no encontrado');

    const allowed = [
      'name',
      'phone',
      'address',
      'document',
      'department',
      'city',
      'avatar',
    ];

    const data: any = {};
    for (const field of allowed) {
      if (dto[field] !== undefined) data[field] = dto[field];
    }

    if (dto.birthdate) {
      const d = new Date(dto.birthdate);
      if (!isNaN(d.getTime())) data.birthdate = d;
    }

    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data,
    });

    return { success: true, data: sanitizeUser(updated) };
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
      const requested = query.role.toUpperCase();
      // El "profesional" que atiende puede estar guardado como PROFESIONAL
      // (rol genérico nuevo) o BARBERO (alias heredado): se tratan igual.
      const PROFESSIONAL = ['PROFESIONAL', 'BARBERO'];
      if (PROFESSIONAL.includes(requested)) {
        where.role = { in: PROFESSIONAL };
      } else {
        where.role = requested;
      }
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
