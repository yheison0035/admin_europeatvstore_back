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
import { PlansConfigService } from '@/common/plans-config.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
    private planLimits: PlanLimitsService,
    private plansConfig: PlansConfigService,
  ) {}

  // LISTADO GLOBAL (todos los usuarios de todas las empresas) — plataforma
  // Activar/desactivar cualquier usuario (soporte de plataforma).
  async platformSetStatus(actingUser: any, id: number, status: string) {
    if (actingUser.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }
    const st = String(status || '').toUpperCase();
    if (!['ACTIVO', 'INACTIVO'].includes(st)) {
      throw new BadRequestException('Estado inválido');
    }
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    if (u.role === Role.SUPER_PLATFORM_ADMIN) {
      throw new BadRequestException(
        'No puedes cambiar un administrador de plataforma.',
      );
    }
    await this.prisma.user.update({
      where: { id },
      data: { status: st as any },
    });
    return { success: true };
  }

  // Resetear la contraseña de cualquier usuario (soporte de plataforma).
  async platformResetPassword(actingUser: any, id: number, password: string) {
    if (actingUser.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }
    const pass = String(password || '');
    if (pass.length < 6) {
      throw new BadRequestException(
        'La contraseña debe tener al menos 6 caracteres.',
      );
    }
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    await this.prisma.user.update({
      where: { id },
      data: { password: await bcrypt.hash(pass, 10) },
    });
    return { success: true, message: 'Contraseña actualizada.' };
  }

  // Roles que la plataforma puede asignar (nunca el de plataforma).
  private assertAssignableRole(role: string) {
    const r = String(role || '').toUpperCase();
    if (!(r in Role) || r === Role.SUPER_PLATFORM_ADMIN) {
      throw new BadRequestException('Rol inválido.');
    }
    return r as Role;
  }

  // Crear un usuario en CUALQUIER empresa (plataforma). No pasa por el límite de
  // plan (aprovisionamiento del rol supremo), pero sí valida email/sede/rol.
  async platformCreateUser(
    actingUser: any,
    companyId: number,
    dto: {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
      localId?: number | null;
      phone?: string;
    },
  ) {
    if (actingUser.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');

    const email = String(dto.email || '')
      .trim()
      .toLowerCase();
    if (!email) throw new BadRequestException('El correo es obligatorio.');
    if (!dto.password || dto.password.length < 6) {
      throw new BadRequestException(
        'La contraseña debe tener al menos 6 caracteres.',
      );
    }
    const role = this.assertAssignableRole(dto.role || Role.ASESOR);

    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException('Ya existe una cuenta con ese correo.');

    // Un solo SUPER_ADMIN por empresa.
    if (role === Role.SUPER_ADMIN) {
      const ya = await this.prisma.user.findFirst({
        where: {
          companyId,
          role: Role.SUPER_ADMIN,
          status: { not: Status.ELIMINADO },
        },
        select: { id: true },
      });
      if (ya)
        throw new ConflictException(
          'Esa empresa ya tiene administrador principal.',
        );
    }

    if (dto.localId) {
      const local = await this.prisma.local.findFirst({
        where: { id: dto.localId, companyId },
        select: { id: true },
      });
      if (!local) throw new BadRequestException('La sede no es de esa empresa.');
    }

    const created = await this.prisma.user.create({
      data: {
        name: dto.name?.trim() || 'Usuario',
        email,
        phone: dto.phone?.trim() || null,
        password: await bcrypt.hash(dto.password, 10),
        role,
        status: Status.ACTIVO,
        companyId,
        localId: dto.localId || null,
      },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    return { success: true, data: created };
  }

  // Editar rol/estado/sede (y opcionalmente reasignar empresa) de cualquier
  // usuario, desde la plataforma.
  async platformUpdateUser(
    actingUser: any,
    id: number,
    dto: {
      name?: string;
      role?: string;
      status?: string;
      localId?: number | null;
      companyId?: number;
    },
  ) {
    if (actingUser.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }
    const current = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, companyId: true },
    });
    if (!current) throw new NotFoundException('Usuario no encontrado');
    if (current.role === Role.SUPER_PLATFORM_ADMIN) {
      throw new BadRequestException(
        'No puedes editar un administrador de plataforma.',
      );
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name?.trim() || undefined;

    // Empresa destino (para validar sede y unicidad de SUPER_ADMIN).
    const targetCompanyId =
      dto.companyId !== undefined ? Number(dto.companyId) : current.companyId;

    if (dto.companyId !== undefined && dto.companyId !== current.companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: Number(dto.companyId) },
        select: { id: true },
      });
      if (!company) throw new NotFoundException('Empresa destino no existe.');
      data.companyId = Number(dto.companyId);
      data.localId = null; // al cambiar de empresa, se limpia la sede
    }

    if (dto.role !== undefined) {
      const role = this.assertAssignableRole(dto.role);
      if (role === Role.SUPER_ADMIN) {
        const ya = await this.prisma.user.findFirst({
          where: {
            companyId: targetCompanyId,
            role: Role.SUPER_ADMIN,
            status: { not: Status.ELIMINADO },
            NOT: { id },
          },
          select: { id: true },
        });
        if (ya)
          throw new ConflictException(
            'Esa empresa ya tiene administrador principal.',
          );
      }
      data.role = role;
    }

    if (dto.status !== undefined) {
      const st = String(dto.status).toUpperCase();
      if (!['ACTIVO', 'INACTIVO'].includes(st)) {
        throw new BadRequestException('Estado inválido.');
      }
      data.status = st;
    }

    if (dto.localId !== undefined && data.localId === undefined) {
      if (dto.localId) {
        const local = await this.prisma.local.findFirst({
          where: { id: Number(dto.localId), companyId: targetCompanyId },
          select: { id: true },
        });
        if (!local)
          throw new BadRequestException('La sede no es de esa empresa.');
        data.localId = Number(dto.localId);
      } else {
        data.localId = null;
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        localId: true,
        companyId: true,
      },
    });
    return { success: true, data: updated };
  }

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
            // Control MANUAL de módulos por empresa (superplatform): el CRM lo
            // usa para mostrar/ocultar cada módulo.
            enabledModules: true,
            // El CRM las usa para mostrar (o no) el módulo de tienda online.
            websiteEnabled: true,
            domain: true,
            // Tema de diseño del panel elegido por el dueño.
            crmTheme: true,
            crmFont: true,
            // Día de inicio del ciclo de cierre (para que las estadísticas del
            // front usen la misma ventana que los cierres, ej. RAGNOR 3→2).
            cycleStartDay: true,
            // Overrides de vocabulario propios (barbería vs estética, etc.).
            terminology: true,
            // Si exige "abrir el día" (caja) para poder vender.
            requireCashOpen: true,
            // Aviso de consignaciones al banco (voz + notificación).
            bankNotifyEnabled: true,
            // Facturación electrónica DIAN habilitada por la plataforma.
            electronicInvoicingEnabled: true,
            // Vinculada al servicio fiscal propio (si ya se activó).
            fiscalCompanyId: true,
            // Empresa de pruebas: gobierna la visibilidad de funciones aún no
            // liberadas al 100% (DIAN). Solo estas empresas ven el tema DIAN.
            isTestCompany: true,
            // Régimen de IVA (para el encabezado de la factura impresa).
            responsableIVA: true,
            // Vencimiento del pago y precio acordado: el CRM del dueño los usa
            // para el aviso de renovación (banner) antes/al vencer.
            paidUntil: true,
            monthlyPrice: true,
            discountedPrice: true,
            discountUntil: true,
          },
        },
        local: true,
        managedLocals: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Módulos configurados para el TIPO de negocio (BusinessTypeConfig, editable
    // por la plataforma). El front los usa para el menú; si no hay fila o está
    // inactiva, queda null y el front cae a su mapa por defecto.
    if (user.company?.type) {
      const typeCfg = await this.prisma.businessTypeConfig.findUnique({
        where: { type: user.company.type },
        select: {
          modules: true,
          active: true,
          terminology: true,
          productFields: true,
          roles: true,
        },
      });
      const c = user.company as any;
      if (typeCfg && typeCfg.active) {
        c.typeModules = typeCfg.modules;
        c.typeTerminology = typeCfg.terminology ?? null;
        c.typeProductFields = typeCfg.productFields ?? null;
        c.typeRoles =
          Array.isArray(typeCfg.roles) && typeCfg.roles.length
            ? typeCfg.roles
            : null;
      } else {
        c.typeModules = null;
        c.typeTerminology = null;
        c.typeProductFields = null;
        c.typeRoles = null;
      }
    }

    if (requester?.id === user.id) {
      return {
        success: true,
        data: sanitizeUser(user, { planConfig: this.plansConfig.config() }),
      };
    }

    const localIds = await getAccessibleLocalIds(this.prisma, requester);

    if (localIds === null) {
      return {
        success: true,
        data: sanitizeUser(user, { planConfig: this.plansConfig.config() }),
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

    // OBLIGATORIO: aislar por empresa del token (evita fuga entre empresas).
    if (!user?.companyId) {
      throw new BadRequestException('Sesión inválida');
    }
    where.companyId = user.companyId;

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

  // PÚBLICO (booking): profesionales (barberos) activos de una sede. La empresa
  // se deriva del local, no del token (la reserva no requiere iniciar sesión).
  async getPublicProfessionals(query: any) {
    const localId = Number(query.localId);
    if (!localId || Number.isNaN(localId)) {
      throw new BadRequestException('localId es obligatorio');
    }
    const local = await this.prisma.local.findUnique({
      where: { id: localId },
      select: { companyId: true },
    });
    if (!local) return [];
    return this.prisma.user.findMany({
      where: {
        localId,
        companyId: local.companyId,
        status: Status.ACTIVO,
        role: { in: [Role.PROFESIONAL, Role.BARBERO] },
      },
      select: { id: true, name: true, avatar: true },
      orderBy: { name: 'asc' },
    });
  }
}

export function sanitizeUser(user: any, extra: Record<string, any> = {}) {
  // Se quitan la contraseña y los campos internos del OTP de recuperación: no
  // deben salir al front (seguridad) y además romperían el editar de usuario,
  // porque el form los reenviaría y el validador (forbidNonWhitelisted) los
  // rechaza al no estar en el DTO.
  const {
    password,
    resetOtpHash,
    resetOtpExpires,
    resetOtpAttempts,
    ...rest
  } = user;

  return {
    ...rest,
    company: user.company ?? null,
    ...extra,
  };
}
