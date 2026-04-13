import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { applyLocalFilter } from 'src/common/local-filter.util';
import { getAccessibleLocalIds } from 'src/common/access-locals.util';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  async findAllPaginated(user: any, query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const where: any = {
      companyId: user.companyId,
    };

    applyLocalFilter(where, user, localIds);

    if (query.barberId) {
      where.barberId = Number(query.barberId);
    }

    if (query.serviceId) {
      where.serviceId = Number(query.serviceId);
    }

    if (query.localId) {
      where.localId = Number(query.localId);
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate && query.endDate) {
      where.date = {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate),
      };
    }

    const isAll = query.all === 'true' || query.all === true;

    if (isAll) {
      const items = await this.prisma.appointment.findMany({
        where,
        include: {
          service: true,
          barber: true,
        },
        orderBy: { date: 'asc' },
      });

      return {
        success: true,
        data: items,
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        include: {
          service: true,
          barber: true,
          customer: true,
          local: true,
        },
        skip,
        take: limit,
        orderBy: { date: 'asc' },
      }),
      this.prisma.appointment.count({ where }),
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

  async create(dto: CreateAppointmentDto, user: any) {
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        barberId: dto.barberId,
        date: new Date(dto.date),
        OR: [
          {
            startTime: { lte: new Date(dto.endTime) },
            endTime: { gte: new Date(dto.startTime) },
          },
        ],
      },
    });

    if (conflict) {
      throw new BadRequestException(
        'El barbero ya tiene una cita en ese horario',
      );
    }

    return this.prisma.appointment.create({
      data: {
        date: new Date(dto.date),
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        notes: dto.notes,
        serviceId: dto.serviceId,
        barberId: dto.barberId,
        customerId: dto.customerId,
        localId: dto.localId,
        companyId: user.companyId,
      },
    });
  }

  async update(id: number, dto: any, user: any) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!appt) throw new NotFoundException();

    return this.prisma.appointment.update({
      where: { id },
      data: {
        ...dto,
      },
    });
  }

  async remove(id: number, user: any) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!appt) throw new NotFoundException();

    await this.prisma.appointment.delete({ where: { id } });

    return { success: true };
  }
}
