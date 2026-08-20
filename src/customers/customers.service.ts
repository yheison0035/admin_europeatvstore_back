import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Status } from '@prisma/client';
import { AuditService } from '@/audit/audit.service';
import { PlanLimitsService } from '@/common/plan-limits.service';
import { getAccessibleLocalIds } from '@/common/access-locals.util';
import { applyLocalFilter } from '@/common/local-filter.util';
import { loyaltyStatus } from '@/common/loyalty.util';

// Segmento comercial del cliente según recencia y frecuencia.
function computeSegment(visits: number, lastVisit: Date | null): string {
  if (!visits) return 'NUEVO';
  const daysSince = lastVisit
    ? Math.floor((Date.now() - new Date(lastVisit).getTime()) / 86400000)
    : 99999;
  if (daysSince > 60) return 'PERDIDO';
  if (daysSince > 20) return 'EN_RIESGO';
  if (visits >= 5) return 'VIP';
  if (visits >= 2) return 'FRECUENTE';
  return 'NUEVO';
}

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private planLimits: PlanLimitsService,
  ) {}

  async findAllPaginated(user: any, query: any) {
    const isAll = query.all === 'true' || query.all === true;

    const where: any = {
      status: { not: Status.ELIMINADO },
      companyId: user.companyId,
    };

    if (query.document) {
      where.document = {
        contains: query.document,
        mode: 'insensitive',
      };
    }

    if (query.name) {
      where.name = {
        contains: query.name,
        mode: 'insensitive',
      };
    }

    if (query.type_document) {
      where.type_document = {
        contains: query.type_document,
        mode: 'insensitive',
      };
    }

    if (query.email) {
      where.email = {
        contains: query.email,
        mode: 'insensitive',
      };
    }

    if (query.phone) {
      where.phone = {
        contains: query.phone,
        mode: 'insensitive',
      };
    }

    if (query.city) {
      where.city = {
        contains: query.city,
        mode: 'insensitive',
      };
    }

    if (query.localId) {
      where.local = {
        is: {
          name: {
            contains: query.localId,
            mode: 'insensitive',
          },
        },
      };
    }

    if (query.status) {
      const normalizedStatus = query.status.toUpperCase();

      if (Object.values(Status).includes(normalizedStatus as Status)) {
        where.status = normalizedStatus as Status;
      }
    }

    // Excluye SOLO al consumidor final. Se incluye document NULL, porque
    // `document <> '222...'` en SQL descarta los NULL sin querer.
    const customerWhere = {
      ...where,
      OR: [{ document: null }, { document: { not: '222222222222' } }],
    };

    // ==========================
    // LISTAR TODOS (SELECTS)
    // ==========================
    if (isAll) {
      const items = await this.prisma.customer.findMany({
        where: customerWhere,
        orderBy: {
          name: 'asc',
        },
        select: {
          id: true,
          name: true,
          document: true,
        },
      });

      const consumidorFinal = await this.prisma.customer.findFirst({
        where: {
          document: '222222222222',
          companyId: user.companyId,
        },
        select: {
          id: true,
          name: true,
          document: true,
        },
      });

      return {
        success: true,
        data: consumidorFinal ? [consumidorFinal, ...items] : items,
      };
    }

    // ==========================
    // PAGINADO
    // ==========================
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where: customerWhere,
        include: {
          local: true,
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),

      this.prisma.customer.count({
        where: customerWhere,
      }),
    ]);

    const consumidorFinal = await this.prisma.customer.findFirst({
      where: {
        document: '222222222222',
        companyId: user.companyId,
      },
      include: {
        local: true,
      },
    });

    const data =
      consumidorFinal && page === 1 ? [consumidorFinal, ...items] : items;

    const auditMap = await this.audit.latestFor(
      'customer',
      data.map((c) => c.id),
      user.companyId,
    );

    return {
      success: true,
      data: data.map((c) => ({ ...c, lastAudit: auditMap[c.id] || null })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Busca un cliente por documento exacto (para autocompletar). Devuelve null
  // si no existe. Aislado por empresa.
  async findByDocument(document: string, user: any) {
    const doc = (document || '').trim();
    if (!doc) {
      return { success: true, data: null };
    }

    const customer = await this.prisma.customer.findFirst({
      where: {
        document: doc,
        companyId: user.companyId,
        status: { not: Status.ELIMINADO },
      },
      include: { local: true },
    });

    if (!customer) return { success: true, data: null };

    // Estado de fidelización (descuento aplicable en la próxima visita) para
    // mostrarlo al facturar.
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
    const loyalty = loyaltyStatus(company as any, customer, new Date());

    return { success: true, data: { ...customer, loyalty } };
  }

  async findOne(id: number, user: any) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
      include: { local: true },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return {
      success: true,
      message: 'Cliente obtenido correctamente',
      data: customer,
    };
  }

  // Ficha 360°: métricas de relación (LTV, visitas, ticket promedio, última
  // visita, lo que suele consumir), historial de ventas y citas, y segmento.
  async getCustomerSummary(id: number, user: any) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId: user.companyId },
      include: { local: { select: { name: true } } },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const saleWhere: any = {
      customerId: id,
      saleStatus: { notIn: ['CANCELADA', 'RECHAZADA', 'DEVUELTA'] as any },
    };
    if (user.role !== 'SUPER_PLATFORM_ADMIN') {
      saleWhere.local = { is: { companyId: user.companyId } };
    }
    applyLocalFilter(saleWhere, user, localIds, 'sale');

    const sales = await this.prisma.sale.findMany({
      where: saleWhere,
      orderBy: { saleDate: 'desc' },
      select: {
        id: true,
        code: true,
        saleDate: true,
        totalAmount: true,
        paymentStatus: true,
        items: {
          select: {
            quantity: true,
            service: { select: { name: true } },
            variant: { select: { inventory: { select: { name: true } } } },
          },
        },
      },
    });

    const visits = sales.length;
    const ltv = sales.reduce((s, x) => s + x.totalAmount, 0);
    const avgTicket = visits ? ltv / visits : 0;
    const lastVisit = sales[0]?.saleDate || null;
    const firstVisit = visits ? sales[visits - 1].saleDate : null;
    const pendingFiado = sales
      .filter((s) => s.paymentStatus === 'FIADO')
      .reduce((a, s) => a + s.totalAmount, 0);

    // Lo que suele consumir (productos y servicios más frecuentes).
    const itemCount = new Map<string, number>();
    for (const s of sales) {
      for (const it of s.items) {
        const name = it.service?.name || it.variant?.inventory?.name;
        if (name) itemCount.set(name, (itemCount.get(name) || 0) + (it.quantity || 1));
      }
    }
    const topItems = [...itemCount.entries()]
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const appointments = await this.prisma.appointment.findMany({
      where: { customerId: id, companyId: user.companyId },
      orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
      take: 15,
      select: {
        id: true,
        date: true,
        startTime: true,
        status: true,
        service: { select: { name: true } },
        barber: { select: { name: true } },
      },
    });

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
    const loyalty = loyaltyStatus(company as any, customer, new Date()) || {
      enabled: false,
    };

    return {
      success: true,
      data: {
        customer,
        loyalty,
        metrics: {
          ltv,
          visits,
          avgTicket,
          firstVisit,
          lastVisit,
          pendingFiado,
          segment: computeSegment(visits, lastVisit),
        },
        topItems,
        sales: sales.slice(0, 20).map((s) => ({
          id: s.id,
          code: s.code,
          saleDate: s.saleDate,
          totalAmount: s.totalAmount,
          paymentStatus: s.paymentStatus,
          items: s.items.map((it) => ({
            quantity: it.quantity,
            name: it.service?.name || it.variant?.inventory?.name || 'Ítem',
          })),
        })),
        appointments,
      },
    };
  }

  // Canjea un premio de fidelización (descuenta 1 premio disponible).
  // Clientes con actividad de fidelización (sellos acumulados o premios por
  // canjear). Ordena primero los que ya tienen premio.
  async loyaltyCustomers(user: any, query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      companyId: user.companyId,
      status: { not: Status.ELIMINADO },
      loyaltyStamps: { gt: 0 },
    };

    if (query.search) {
      where.AND = [
        {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search, mode: 'insensitive' } },
            { document: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [items, total, company] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ loyaltyStamps: 'desc' }],
        select: {
          id: true,
          name: true,
          phone: true,
          document: true,
          loyaltyStamps: true,
          loyaltyLastVisit: true,
        },
      }),
      this.prisma.customer.count({ where }),
      this.prisma.company.findUnique({
        where: { id: user.companyId },
        select: {
          loyaltyEnabled: true,
          loyaltyTier1Visits: true,
          loyaltyTier1Percent: true,
          loyaltyTier2Visits: true,
          loyaltyTier2Percent: true,
          loyaltyMaxDays: true,
        },
      }),
    ]);

    const now = new Date();
    const data = items.map((c) => ({
      ...c,
      loyalty: loyaltyStatus(company as any, c, now),
    }));

    return {
      success: true,
      data,
      config: company,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async redeemLoyaltyReward(id: number, user: any) {
    const cust = await this.prisma.customer.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!cust) throw new NotFoundException('Cliente no encontrado');
    if (cust.loyaltyRewards <= 0) {
      throw new BadRequestException('El cliente no tiene premios por canjear');
    }
    const updated = await this.prisma.customer.update({
      where: { id },
      data: { loyaltyRewards: { decrement: 1 } },
    });
    return { success: true, data: { id, loyaltyRewards: updated.loyaltyRewards } };
  }

  async create(dto: CreateCustomerDto, user: any) {
    // Límite de clientes según el plan de la empresa.
    await this.planLimits.assertCanCreate(user.companyId, 'customers');

    // El cliente es global por empresa, pero guardamos el "local de registro"
    // (de dónde viene): el del contexto (factura/formulario) o, si no llega,
    // el local del usuario que lo crea. Es solo informativo, no restringe.
    let localId: number | null = dto.localId || user.localId || null;

    if (localId) {
      const local = await this.prisma.local.findFirst({
        where: { id: localId, companyId: user.companyId },
        select: { id: true },
      });
      localId = local ? local.id : null; // si no es de la empresa, se ignora
    }

    const { localId: _, birthday, ...rest } = dto;

    const customer = await this.prisma.customer.create({
      data: {
        ...rest,
        ...(birthday ? { birthday: new Date(birthday) } : {}),
        // Valores por defecto cuando se crea rápido (modal): cédula, un
        // documento dinámico no repetido y ubicación Itagüí, Antioquia.
        type_document: rest.type_document || 'CC',
        document: rest.document || String(Date.now()),
        department: rest.department || 'ANTIOQUIA',
        city: rest.city || 'ITAGUI',

        company: {
          connect: { id: user.companyId },
        },

        ...(localId && {
          local: {
            connect: { id: localId },
          },
        }),
      },
    });

    await this.audit.log({
      entity: 'customer',
      entityId: customer.id,
      action: 'CREATE',
      user,
    });

    return {
      success: true,
      message: 'Cliente creado correctamente',
      data: customer,
    };
  }

  async update(id: number, dto: UpdateCustomerDto, user: any) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    if (customer.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes permiso');
    }

    const { localId, birthday, ...rest } = dto;

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        ...rest,

        ...(birthday !== undefined && {
          birthday: birthday ? new Date(birthday) : null,
        }),

        ...(localId !== undefined && {
          local: localId ? { connect: { id: localId } } : { disconnect: true },
        }),
      },
    });

    const changes = this.audit.diff(customer, dto, [
      'type_document',
      'document',
      'name',
      'email',
      'phone',
      'department',
      'city',
      'address',
      'birthday',
      'notes',
      'status',
      'localId',
    ]);
    await this.audit.log({
      entity: 'customer',
      entityId: id,
      action: 'UPDATE',
      user,
      changes,
    });

    return {
      success: true,
      message: 'Cliente actualizado correctamente',
      data: updated,
    };
  }

  async remove(id: number, user: any) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        companyId: user.companyId,
      },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    await this.prisma.customer.update({
      where: { id },
      data: { status: Status.ELIMINADO },
    });

    await this.audit.log({
      entity: 'customer',
      entityId: id,
      action: 'DELETE',
      user,
    });

    return {
      success: true,
      message: 'Cliente eliminado correctamente',
    };
  }
}
