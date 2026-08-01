import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { PaymentMethod, Role, Status } from '@prisma/client';
import { hasRole } from '@/common/role-check.util';
import { getAccessibleLocalIds } from '@/common/access-locals.util';
import { CreateExpenseDto } from './dto/create-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expenses.dto';
import { applyLocalFilter } from '@/common/local-filter.util';
import { PlanLimitsService } from '@/common/plan-limits.service';
import { AuditService } from '@/audit/audit.service';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private audit: AuditService,
    private planLimits: PlanLimitsService,
  ) {}

  async findAllPaginated(user: any, query: any) {
    await this.planLimits.assertModule(user.companyId, 'expenses');

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const where: any = {
      status: { not: Status.ELIMINADO },

      local: {
        companyId: user.companyId,
      },
    };

    applyLocalFilter(where, user, localIds, 'expense');

    if (query.concept) {
      where.concept = { contains: query.concept, mode: 'insensitive' };
    }

    if (query.type) {
      where.type = { contains: query.type, mode: 'insensitive' };
    }

    if (query.paidTo) {
      where.paidTo = { contains: query.paidTo, mode: 'insensitive' };
    }

    if (query.amount && !isNaN(Number(query.amount))) {
      where.amount = Number(query.amount);
    }

    if (query.paymentMethod) {
      const normalizedPaymentMethod = query.paymentMethod.toUpperCase();

      if (
        Object.values(PaymentMethod).includes(
          normalizedPaymentMethod as PaymentMethod,
        )
      ) {
        where.paymentMethod = normalizedPaymentMethod as PaymentMethod;
      }
    }

    if (query.status) {
      const normalizedStatus = query.status.toUpperCase();

      if (Object.values(Status).includes(normalizedStatus as Status)) {
        where.status = normalizedStatus as Status;
      }
    }

    if (query.localId) {
      where.local = {
        name: { contains: query.localId, mode: 'insensitive' },
        companyId: user.companyId,
      };
    }

    if (query.providerId) {
      where.provider = {
        name: { contains: query.providerId, mode: 'insensitive' },
      };
    }

    if (query.expenseDate) {
      const raw = String(query.expenseDate).trim();
      let y: number | undefined;
      let m: number | undefined;
      let d: number | undefined;

      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        [y, m, d] = raw.slice(0, 10).split('-').map(Number);
      } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
        [d, m, y] = raw.split('/').map(Number);
      }

      if (y && m && d) {
        // expenseDate es solo fecha (medianoche UTC): rango del día en UTC.
        const startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
        const endOfDay = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));

        where.expenseDate = {
          gte: startOfDay,
          lte: endOfDay,
        };
      }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        skip,
        take: limit,
        include: {
          provider: true,
          local: true,
        },
        orderBy: { expenseDate: 'desc' },
      }),
      this.prisma.expense.count({ where }),
    ]);

    const auditMap = await this.audit.latestFor(
      'expense',
      items.map((e) => e.id),
      user.companyId,
    );

    return {
      success: true,
      data: items.map((e) => ({ ...e, lastAudit: auditMap[e.id] || null })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number, user: any) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const expense = await this.prisma.expense.findFirst({
      where: {
        id,
        status: { not: Status.ELIMINADO },

        // MULTIEMPRESA
        local: {
          companyId: user.companyId,
        },

        ...(localIds !== null && { localId: { in: localIds } }),
      },
      include: {
        provider: true,
        local: true,
      },
    });

    if (!expense) {
      throw new NotFoundException(`Gasto con ID ${id} no encontrado`);
    }

    return {
      success: true,
      message: 'Gasto obtenido correctamente',
      data: expense,
    };
  }

  async create(dto: CreateExpenseDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN, Role.RECEPCIONISTA])) {
      throw new ForbiddenException('No tienes permisos');
    }

    // 🔥 VALIDAR QUE EL LOCAL SEA DE LA EMPRESA
    const local = await this.prisma.local.findFirst({
      where: {
        id: dto.localId,
        companyId: user.companyId,
      },
    });

    if (!local) {
      throw new ForbiddenException('Local no pertenece a tu empresa');
    }

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    if (localIds !== null && !localIds.includes(dto.localId)) {
      throw new ForbiddenException('No tienes acceso a este local');
    }

    const expense = await this.prisma.expense.create({
      data: {
        concept: dto.concept,
        type: dto.type,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        paidTo: dto.paidTo,
        notes: dto.notes,
        expenseDate: new Date(dto.expenseDate),
        localId: dto.localId,
        providerId: dto.providerId,
        status: dto.status ?? Status.ACTIVO,
      },
    });

    await this.audit.log({
      entity: 'expense',
      entityId: expense.id,
      action: 'CREATE',
      user,
    });

    return {
      success: true,
      message: 'Gasto registrado correctamente',
      data: expense,
    };
  }

  async update(id: number, dto: UpdateExpenseDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN, Role.RECEPCIONISTA])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const localIds = await getAccessibleLocalIds(this.prisma, user);
    const found = await this.prisma.expense.findFirst({
      where: {
        id,
        local: {
          companyId: user.companyId,
        },
        ...(localIds !== null && { localId: { in: localIds } }),
      },
    });

    if (!found || found.status === Status.ELIMINADO) {
      throw new NotFoundException(`Gasto con ID ${id} no encontrado`);
    }

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.expenseDate && { expenseDate: new Date(dto.expenseDate) }),
      },
    });

    const changes = this.audit.diff(found, dto, [
      'concept',
      'type',
      'amount',
      'paymentMethod',
      'paidTo',
      'status',
      'providerId',
      'localId',
    ]);
    await this.audit.log({
      entity: 'expense',
      entityId: id,
      action: 'UPDATE',
      user,
      changes,
    });

    return {
      success: true,
      message: 'Gasto actualizado correctamente',
      data: updated,
    };
  }

  async remove(id: number, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const localIds = await getAccessibleLocalIds(this.prisma, user);
    const found = await this.prisma.expense.findFirst({
      where: {
        id,
        local: {
          companyId: user.companyId,
        },
        ...(localIds !== null && { localId: { in: localIds } }),
      },
    });

    if (!found || found.status === Status.ELIMINADO) {
      throw new NotFoundException(`Gasto con ID ${id} no encontrado`);
    }

    await this.prisma.expense.update({
      where: { id },
      data: { status: Status.ELIMINADO },
    });

    await this.audit.log({
      entity: 'expense',
      entityId: id,
      action: 'DELETE',
      user,
    });

    return {
      success: true,
      message: 'Gasto eliminado correctamente',
    };
  }
}
