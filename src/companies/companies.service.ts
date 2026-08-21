import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { applyLoyaltyVisit } from '@/common/loyalty.util';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Role, Status } from '@prisma/client';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(private prisma: PrismaService) {}

  // Configuración self-service que ve/edita el dueño de la empresa.
  async getOwnSettings(user: any) {
    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        name: true,
        logo: true,
        phone: true,
        email: true,
        type: true,
        nit: true,
        crmTheme: true,
        requireCashOpen: true,
        responsableIVA: true,
        preciosIncluyenIVA: true,
        defaultTaxRate: true,
        businessName: true,
        dv: true,
        personType: true,
        taxRegime: true,
        fiscalAddress: true,
        fiscalCity: true,
        loyaltyEnabled: true,
        loyaltyTier1Visits: true,
        loyaltyTier1Percent: true,
        loyaltyTier2Visits: true,
        loyaltyTier2Percent: true,
        loyaltyMaxDays: true,
        openHour: true,
        closeHour: true,
      },
    });
    return { success: true, data: company };
  }

  // Datos básicos de la empresa (nombre, logo, contacto).
  async updateProfile(
    user: any,
    dto: {
      name?: string;
      logo?: string;
      phone?: string;
      email?: string;
      nit?: string;
    },
  ) {
    const data: any = {};
    if (dto.name?.trim()) data.name = dto.name.trim();
    if (dto.logo !== undefined) data.logo = dto.logo || null;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.email !== undefined) data.email = dto.email || null;
    if (dto.nit !== undefined) data.nit = dto.nit || null;

    const company = await this.prisma.company.update({
      where: { id: user.companyId },
      data,
      select: { name: true, logo: true, phone: true, email: true, nit: true },
    });
    return { success: true, data: company };
  }

  // Horario de atención (para disponibilidad de citas).
  async updateHours(
    user: any,
    dto: { openHour?: number; closeHour?: number },
  ) {
    const clamp = (h: number) => Math.min(23, Math.max(0, Math.floor(h)));
    const data: any = {};
    if (dto.openHour != null) data.openHour = clamp(Number(dto.openHour));
    if (dto.closeHour != null) data.closeHour = clamp(Number(dto.closeHour));
    if (
      data.openHour != null &&
      data.closeHour != null &&
      data.closeHour <= data.openHour
    ) {
      data.closeHour = data.openHour + 1;
    }

    const company = await this.prisma.company.update({
      where: { id: user.companyId },
      data,
      select: { openHour: true, closeHour: true },
    });
    return { success: true, data: company };
  }

  // Sincroniza la fidelización con el historial de ventas: reproduce, cliente
  // por cliente y en orden cronológico, todas sus ventas completadas por la
  // lógica de escalones (respetando la ventana de días). Deja a cada cliente en
  // su posición real del ciclo. Es re-ejecutable (recalcula desde cero).
  async syncLoyaltyFromSales(user: any) {
    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        loyaltyEnabled: true,
        loyaltyTier1Visits: true,
        loyaltyTier1Percent: true,
        loyaltyTier2Visits: true,
        loyaltyTier2Percent: true,
        loyaltyMaxDays: true,
      },
    });
    if (!company?.loyaltyEnabled) {
      throw new BadRequestException(
        'Activa la fidelización antes de sincronizar.',
      );
    }

    // Ventas identificadas y completadas (no anuladas/devueltas), ordenadas por
    // cliente y fecha. El "Consumidor Final" (222222222222) no acumula.
    const sales = await this.prisma.sale.findMany({
      where: {
        customerId: { not: null },
        saleStatus: { notIn: ['CANCELADA', 'RECHAZADA', 'DEVUELTA'] as any },
        local: { is: { companyId: user.companyId } },
        customer: { is: { document: { not: '222222222222' } } },
      },
      select: { customerId: true, saleDate: true },
      orderBy: [{ customerId: 'asc' }, { saleDate: 'asc' }],
    });

    // Reproduce el historial por cliente.
    const state = new Map<number, { stamps: number; last: Date | null }>();
    for (const s of sales) {
      const cid = s.customerId as number;
      const cur = state.get(cid) || { stamps: 0, last: null };
      const { newCount } = applyLoyaltyVisit(
        company as any,
        { loyaltyStamps: cur.stamps, loyaltyLastVisit: cur.last },
        new Date(s.saleDate),
      );
      state.set(cid, { stamps: newCount, last: new Date(s.saleDate) });
    }

    // Reinicia a cero los clientes de la empresa que no tuvieron ventas (para
    // que un re-cálculo sea consistente) y aplica el estado calculado.
    const ops: any[] = [];
    for (const [cid, st] of state) {
      ops.push(
        this.prisma.customer.update({
          where: { id: cid },
          data: { loyaltyStamps: st.stamps, loyaltyLastVisit: st.last },
        }),
      );
    }

    // Ejecuta en lotes para no saturar la conexión.
    const chunkSize = 100;
    for (let i = 0; i < ops.length; i += chunkSize) {
      await this.prisma.$transaction(ops.slice(i, i + chunkSize));
    }

    return {
      success: true,
      message: 'Fidelización sincronizada con las ventas',
      data: {
        customersUpdated: state.size,
        salesProcessed: sales.length,
      },
    };
  }

  // Configuración fiscal (IVA / datos para facturar).
  async updateFiscal(user: any, dto: any) {
    const data: any = {};
    if (typeof dto.responsableIVA === 'boolean')
      data.responsableIVA = dto.responsableIVA;
    if (typeof dto.preciosIncluyenIVA === 'boolean')
      data.preciosIncluyenIVA = dto.preciosIncluyenIVA;
    if (dto.defaultTaxRate != null) {
      const r = Math.min(100, Math.max(0, Number(dto.defaultTaxRate) || 0));
      data.defaultTaxRate = r;
    }
    if (dto.businessName !== undefined) data.businessName = dto.businessName || null;
    if (dto.dv !== undefined) data.dv = dto.dv || null;
    if (dto.personType !== undefined) data.personType = dto.personType || null;
    if (dto.taxRegime !== undefined) data.taxRegime = dto.taxRegime || null;
    if (dto.fiscalAddress !== undefined)
      data.fiscalAddress = dto.fiscalAddress || null;
    if (dto.fiscalCity !== undefined) data.fiscalCity = dto.fiscalCity || null;

    const company = await this.prisma.company.update({
      where: { id: user.companyId },
      data,
      select: {
        responsableIVA: true,
        preciosIncluyenIVA: true,
        defaultTaxRate: true,
        businessName: true,
        dv: true,
        personType: true,
        taxRegime: true,
        fiscalAddress: true,
        fiscalCity: true,
      },
    });
    return { success: true, data: company };
  }

  // Política de caja: exigir "abrir el día" (caja) para poder vender.
  async updateCashPolicy(user: any, requireCashOpen: boolean) {
    const company = await this.prisma.company.update({
      where: { id: user.companyId },
      data: { requireCashOpen: !!requireCashOpen },
      select: { requireCashOpen: true },
    });
    return { success: true, data: company };
  }

  // Tema de diseño del panel/CRM (colores). Solo valores permitidos.
  async updateCrmTheme(user: any, theme: string) {
    const allowed = ['orange', 'blue', 'emerald'];
    const value = allowed.includes(theme) ? theme : 'orange';
    const company = await this.prisma.company.update({
      where: { id: user.companyId },
      data: { crmTheme: value },
      select: { crmTheme: true },
    });
    return { success: true, data: company };
  }

  async updateLoyalty(
    user: any,
    dto: {
      loyaltyEnabled?: boolean;
      loyaltyTier1Visits?: number;
      loyaltyTier1Percent?: number;
      loyaltyTier2Visits?: number;
      loyaltyTier2Percent?: number;
      loyaltyMaxDays?: number;
      // legado
      loyaltyStampsRequired?: number;
      loyaltyReward?: string;
    },
  ) {
    const data: any = {};
    const int = (v: any, min: number, max: number, def: number) =>
      Math.min(max, Math.max(min, Math.floor(Number(v) || def)));

    if (typeof dto.loyaltyEnabled === 'boolean') {
      data.loyaltyEnabled = dto.loyaltyEnabled;
    }
    if (dto.loyaltyTier1Visits != null)
      data.loyaltyTier1Visits = int(dto.loyaltyTier1Visits, 1, 99, 4);
    if (dto.loyaltyTier1Percent != null)
      data.loyaltyTier1Percent = int(dto.loyaltyTier1Percent, 0, 100, 50);
    if (dto.loyaltyTier2Visits != null)
      data.loyaltyTier2Visits = int(dto.loyaltyTier2Visits, 1, 99, 8);
    if (dto.loyaltyTier2Percent != null)
      data.loyaltyTier2Percent = int(dto.loyaltyTier2Percent, 0, 100, 100);
    if (dto.loyaltyMaxDays != null)
      data.loyaltyMaxDays = int(dto.loyaltyMaxDays, 1, 365, 25);
    if (dto.loyaltyStampsRequired != null) {
      data.loyaltyStampsRequired = Math.max(
        1,
        Math.floor(Number(dto.loyaltyStampsRequired) || 10),
      );
    }
    if (typeof dto.loyaltyReward === 'string') {
      data.loyaltyReward = dto.loyaltyReward.trim() || '1 servicio gratis';
    }

    const company = await this.prisma.company.update({
      where: { id: user.companyId },
      data,
      select: {
        loyaltyEnabled: true,
        loyaltyTier1Visits: true,
        loyaltyTier1Percent: true,
        loyaltyTier2Visits: true,
        loyaltyTier2Percent: true,
        loyaltyMaxDays: true,
      },
    });
    return { success: true, data: company };
  }

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
          ...(dto.domain !== undefined && { domain: dto.domain || null }),
          ...(dto.websiteEnabled !== undefined && {
            websiteEnabled: dto.websiteEnabled,
          }),
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

    // Dominio de la tienda: se normaliza (sin protocolo, sin www, sin puerto)
    // y se comprueba que no lo esté usando otra empresa, porque es la clave
    // con la que la tienda sabe de quién es cada visita.
    let domain: string | null | undefined;

    if (dto.domain !== undefined) {
      domain = dto.domain
        ? dto.domain
            .trim()
            .replace(/^https?:\/\//, '')
            .split('/')[0]
            .split(':')[0]
            .replace(/^www\./, '')
            .toLowerCase()
        : null;

      if (domain) {
        const taken = await this.prisma.company.findFirst({
          where: { domain, NOT: { id } },
          select: { id: true, name: true },
        });

        if (taken) {
          throw new ConflictException(
            `El dominio ${domain} ya lo usa la empresa ${taken.name}.`,
          );
        }
      }
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
        ...(domain !== undefined && { domain }),
        ...(dto.websiteEnabled !== undefined && {
          websiteEnabled: dto.websiteEnabled,
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
