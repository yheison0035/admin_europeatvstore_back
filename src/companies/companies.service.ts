import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Role, Status } from '@prisma/client';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(private prisma: PrismaService) {}

  // AUTO-SUSPENSIÓN POR IMPAGO: cada día se desactivan las empresas activas
  // cuya fecha de pago (paidUntil) ya venció. Reactivar = extender paidUntil a
  // futuro y volver a ACTIVO desde el panel. Las empresas sin paidUntil (null)
  // no se tocan (control manual / sin vencimiento).
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async autoSuspendOverdue() {
    const now = new Date();

    const result = await this.prisma.company.updateMany({
      where: {
        status: Status.ACTIVO,
        paidUntil: { lt: now },
      },
      data: { status: Status.INACTIVO },
    });

    if (result.count > 0) {
      this.logger.warn(
        `Auto-suspensión: ${result.count} empresa(s) vencida(s) desactivada(s).`,
      );
    }
  }

  // RESUMEN GLOBAL DE PLATAFORMA (para el dashboard del SUPER_PLATFORM_ADMIN)
  async platformOverview(user: any) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }

    const now = new Date();

    const [companies, totalUsers, totalLocals] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where: { status: { not: Status.ELIMINADO } },
        select: {
          id: true,
          name: true,
          status: true,
          type: true,
          paidUntil: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.count({ where: { status: { not: Status.ELIMINADO } } }),
      this.prisma.local.count({
        where: { status: { not: Status.ELIMINADO } },
      }),
    ]);

    const active = companies.filter((c) => c.status === Status.ACTIVO).length;
    const suspended = companies.filter(
      (c) => c.status === Status.INACTIVO,
    ).length;
    const overdue = companies.filter(
      (c) => c.paidUntil && new Date(c.paidUntil) < now,
    ).length;

    const expiringSoon = companies
      .filter((c) => {
        if (!c.paidUntil) return false;
        const diffDays =
          (new Date(c.paidUntil).getTime() - now.getTime()) / 86_400_000;
        return diffDays >= 0 && diffDays <= 7;
      })
      .map((c) => ({ id: c.id, name: c.name, paidUntil: c.paidUntil }));

    return {
      success: true,
      data: {
        totals: {
          companies: companies.length,
          active,
          suspended,
          overdue,
          users: totalUsers,
          locals: totalLocals,
        },
        expiringSoon,
      },
    };
  }

  // LISTADO GLOBAL
  async findAllPaginated(user: any, query: any) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      status: { not: Status.ELIMINADO },
    };

    if (query.name) {
      where.name = { contains: query.name, mode: 'insensitive' };
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.manager) {
      where.manager = { contains: query.manager, mode: 'insensitive' };
    }

    if (query.phone) {
      where.phone = { contains: query.phone, mode: 'insensitive' };
    }

    if (query.status) {
      const status = query.status.toUpperCase();
      if (Object.values(Status).includes(status)) {
        where.status = status;
      }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        include: {
          // Solo el administrador inicial (SUPER_ADMIN) y sin exponer contraseñas.
          users: {
            where: { role: Role.SUPER_ADMIN, status: { not: Status.ELIMINADO } },
            select: { id: true, email: true, name: true },
            orderBy: { id: 'asc' },
            take: 1,
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.company.count({ where }),
    ]);

    // Se aplana el correo de acceso del administrador para el listado.
    const data = items.map(({ users, ...company }) => ({
      ...company,
      adminEmail: users[0]?.email ?? null,
      adminName: users[0]?.name ?? null,
    }));

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // OBTENER UNA EMPRESA
  async findOne(id: number, user: any) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }

    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        users: {
          where: { role: Role.SUPER_ADMIN, status: { not: Status.ELIMINADO } },
          select: { id: true, email: true, name: true },
          orderBy: { id: 'asc' },
          take: 1,
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const { users, ...rest } = company;

    return {
      success: true,
      data: {
        ...rest,
        adminEmail: users[0]?.email ?? null,
        adminName: users[0]?.name ?? null,
      },
    };
  }

  // CREAR EMPRESA
  async create(dto: CreateCompanyDto, user: any) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }

    // Si se van a crear credenciales de administrador, validar el correo antes
    // (email es único global) y preparar el hash fuera de la transacción.
    let adminData: {
      email: string;
      password: string;
      name: string;
    } | null = null;

    if (dto.adminEmail && dto.adminPassword) {
      const exists = await this.prisma.user.findUnique({
        where: { email: dto.adminEmail },
      });
      if (exists) {
        throw new ConflictException(
          'Ya existe un usuario con ese correo. Usa otro para el administrador.',
        );
      }

      adminData = {
        email: dto.adminEmail,
        password: await bcrypt.hash(dto.adminPassword, 10),
        name: dto.adminName?.trim() || 'Administrador',
      };
    }

    // Empresa + su usuario administrador (SUPER_ADMIN) de forma atómica: si algo
    // falla, no queda una empresa sin acceso ni un usuario huérfano.
    const result = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: dto.name,
          logo: dto.logo,
          phone: dto.phone,
          manager: dto.manager,
          type: dto.type,
          status: dto.status ?? Status.ACTIVO,
          plan: dto.plan ?? null,
          paidUntil: dto.paidUntil ? new Date(dto.paidUntil) : null,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
        },
      });

      let admin: { id: number; email: string; name: string } | null = null;

      if (adminData) {
        admin = await tx.user.create({
          data: {
            email: adminData.email,
            password: adminData.password,
            name: adminData.name,
            role: Role.SUPER_ADMIN,
            status: Status.ACTIVO,
            companyId: company.id,
          },
          select: { id: true, email: true, name: true },
        });
      }

      return { company, admin };
    });

    return {
      success: true,
      message: adminData
        ? 'Empresa y administrador creados correctamente'
        : 'Empresa creada correctamente',
      data: result.company,
      admin: result.admin,
    };
  }

  // ACTUALIZAR EMPRESA
  async update(id: number, dto: UpdateCompanyDto, user: any) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.company.findUnique({
      where: { id },
    });

    if (!found) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const updated = await this.prisma.company.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.logo !== undefined && { logo: dto.logo }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.manager !== undefined && { manager: dto.manager }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.plan !== undefined && { plan: dto.plan || null }),
        ...(dto.paidUntil !== undefined && {
          paidUntil: dto.paidUntil ? new Date(dto.paidUntil) : null,
        }),
        ...(dto.startDate !== undefined && {
          startDate: dto.startDate ? new Date(dto.startDate) : null,
        }),
      },
    });

    return {
      success: true,
      message: 'Empresa actualizada correctamente',
      data: updated,
    };
  }

  // ACTIVAR / DESACTIVAR (suspensión por impago)
  async setStatus(id: number, status: Status, user: any) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }

    if (status !== Status.ACTIVO && status !== Status.INACTIVO) {
      throw new ForbiddenException('Estado no válido');
    }

    const found = await this.prisma.company.findUnique({ where: { id } });

    if (!found || found.status === Status.ELIMINADO) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const updated = await this.prisma.company.update({
      where: { id },
      data: { status },
    });

    return {
      success: true,
      message:
        status === Status.ACTIVO ? 'Empresa activada' : 'Empresa desactivada',
      data: updated,
    };
  }

  // ELIMINAR (SOFT DELETE)
  async remove(id: number, user: any) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.company.findUnique({
      where: { id },
    });

    if (!found) {
      throw new NotFoundException('Empresa no encontrada');
    }

    await this.prisma.company.update({
      where: { id },
      data: {
        status: Status.ELIMINADO,
      },
    });

    return {
      success: true,
      message: 'Empresa eliminada correctamente',
    };
  }
}
