import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { PaymentMethod, Role, Status } from '@prisma/client';
import { hasRole } from 'src/common/role-check.util';
import { getAccessibleLocalIds } from 'src/common/access-locals.util';
import { CreateExpenseDto } from './dto/create-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expenses.dto';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllPaginated(user: any, query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const where: any = {
      status: { not: Status.ELIMINADO },
    };

    if (localIds !== null) {
      if (localIds.length === 0) where.localId = -1;
      else where.localId = { in: localIds };
    }

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
      };
    }

    if (query.providerId) {
      where.provider = {
        name: { contains: query.providerId, mode: 'insensitive' },
      };
    }

    if (query.expenseDate) {
      const date = new Date(query.expenseDate);

      if (!isNaN(date.getTime())) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);

        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        where.expenseDate = {
          gte: start,
          lte: end,
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

  async findOne(id: number, user: any) {
    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const expense = await this.prisma.expense.findFirst({
      where: {
        id,
        status: { not: Status.ELIMINADO },
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
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
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

    return {
      success: true,
      message: 'Gasto registrado correctamente',
      data: expense,
    };
  }

  async update(id: number, dto: UpdateExpenseDto, user: any) {
    if (!hasRole(user.role, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('No tienes permisos');
    }

    const found = await this.prisma.expense.findUnique({
      where: { id },
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

    const found = await this.prisma.expense.findUnique({
      where: { id },
    });

    if (!found || found.status === Status.ELIMINADO) {
      throw new NotFoundException(`Gasto con ID ${id} no encontrado`);
    }

    await this.prisma.expense.update({
      where: { id },
      data: { status: Status.ELIMINADO },
    });

    return {
      success: true,
      message: 'Gasto eliminado correctamente',
    };
  }
}
