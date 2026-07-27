import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { applyLocalFilter } from '@/common/local-filter.util';
import { getAccessibleLocalIds } from '@/common/access-locals.util';
import { minutesToColombiaHour, timeToMinutes } from '@/utils/format';

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

    // Las columnas muestran nombres (barbero, servicio, cliente, local) y el
    // filtro es un input de texto, así que filtramos por el nombre de la
    // relación. Si llega un número puro, se filtra por id.
    const byRelationName = (value: string) => ({
      is: { name: { contains: value.trim(), mode: 'insensitive' } },
    });

    if (query.barberId) {
      const v = String(query.barberId).trim();
      if (/^\d+$/.test(v)) where.barberId = Number(v);
      else where.barber = byRelationName(v);
    }

    if (query.serviceId) {
      const v = String(query.serviceId).trim();
      if (/^\d+$/.test(v)) where.serviceId = Number(v);
      else where.service = byRelationName(v);
    }

    if (query.customerId) {
      const v = String(query.customerId).trim();
      if (/^\d+$/.test(v)) where.customerId = Number(v);
      else where.customer = byRelationName(v);
    }

    // Para local no sobreescribimos el filtro de acceso (where.localId);
    // filtramos por nombre de la relación.
    if (query.localId) {
      where.local = byRelationName(String(query.localId));
    }

    if (query.status) where.status = query.status;

    if (query.startTime) {
      where.startTime = { contains: query.startTime, mode: 'insensitive' };
    }

    if (query.notes) {
      where.notes = { contains: query.notes, mode: 'insensitive' };
    }

    if (query.date) {
      const parsed = new Date(query.date);
      if (!Number.isNaN(parsed.getTime())) {
        const start = new Date(parsed);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        where.date = { gte: start, lt: end };
      }
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
        orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
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

  async findOne(id: number, user: any) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        service: true,
        barber: true,
        customer: true,
        local: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Cita no encontrada');
    }

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    if (localIds !== null && !localIds.includes(appointment.localId)) {
      throw new BadRequestException('No tienes acceso a esta cita');
    }

    return {
      success: true,
      data: appointment,
    };
  }

  async create(dto: CreateAppointmentDto, user: any) {
    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    const startMinutes = timeToMinutes(dto.startTime);
    const endMinutes = startMinutes + service.duration;

    const appointments = await this.prisma.appointment.findMany({
      where: {
        barberId: dto.barberId,
        date: new Date(dto.date),
      },
      include: {
        service: true,
      },
    });

    const conflict = appointments.some((a) => {
      const aStart = timeToMinutes(a.startTime);
      const aEnd = aStart + a.service.duration;

      return startMinutes < aEnd && endMinutes > aStart;
    });

    if (conflict) {
      throw new BadRequestException('Horario no disponible');
    }

    return this.prisma.appointment.create({
      data: {
        date: new Date(dto.date),
        startTime: dto.startTime,
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
      where: {
        id,
        companyId: user.companyId,
      },
      include: {
        service: true,
      },
    });

    if (!appt) {
      throw new NotFoundException('Cita no encontrada');
    }

    const serviceId = dto.serviceId ?? appt.serviceId;
    const barberId = dto.barberId ?? appt.barberId;

    const appointmentDate = dto.date ? new Date(dto.date) : appt.date;

    const startTime = dto.startTime ?? appt.startTime;

    const service = await this.prisma.service.findUnique({
      where: {
        id: serviceId,
      },
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    const startMinutes = timeToMinutes(startTime);
    const endMinutes = startMinutes + service.duration;

    const appointments = await this.prisma.appointment.findMany({
      where: {
        barberId,
        date: appointmentDate,
        NOT: {
          id,
        },
      },
      include: {
        service: true,
      },
    });

    const conflict = appointments.some((a) => {
      const aStart = timeToMinutes(a.startTime);
      const aEnd = aStart + a.service.duration;

      return startMinutes < aEnd && endMinutes > aStart;
    });

    if (conflict) {
      throw new BadRequestException('Horario no disponible');
    }

    return this.prisma.appointment.update({
      where: {
        id,
      },
      data: {
        date: dto.date ? new Date(dto.date) : appt.date,

        startTime: dto.startTime ?? appt.startTime,

        notes: dto.notes ?? appt.notes,

        status: dto.status ?? appt.status,

        serviceId,
        barberId,

        customerId: dto.customerId ?? appt.customerId,

        localId: dto.localId ?? appt.localId,
      },
      include: {
        service: true,
        barber: true,
        customer: true,
        local: true,
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

  // Devuelve los horarios disponibles para un barbero, fecha y servicio dado
  async getAvailability(query: any) {
    const {
      barberId,
      date,
      serviceId,
      appointmentId, // opcional cuando se edita
    } = query;

    if (!barberId || !date || !serviceId) {
      throw new BadRequestException('Faltan datos');
    }

    const service = await this.prisma.service.findUnique({
      where: {
        id: Number(serviceId),
      },
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    const duration = service.duration;

    const startHour = 9;
    const endHour = 20;
    const interval = 10;

    const slots: number[] = [];

    for (
      let minutes = startHour * 60;
      minutes < endHour * 60;
      minutes += interval
    ) {
      slots.push(minutes);
    }

    const appointments = await this.prisma.appointment.findMany({
      where: {
        barberId: Number(barberId),

        ...(appointmentId && {
          NOT: {
            id: Number(appointmentId),
          },
        }),
      },
      include: {
        service: true,
      },
    });

    const sameDayAppointments = appointments.filter((appointment) => {
      const appointmentDate = appointment.date.toISOString().split('T')[0];

      return appointmentDate === date;
    });

    const normalizedAppointments = sameDayAppointments.map((appointment) => {
      const start = timeToMinutes(appointment.startTime);
      const end = start + appointment.service.duration;

      return {
        start,
        end,
      };
    });

    const available = slots.filter((slotStart) => {
      const slotEnd = slotStart + duration;

      if (slotEnd > endHour * 60) {
        return false;
      }

      return !normalizedAppointments.some((appointment) => {
        return slotStart < appointment.end && slotEnd > appointment.start;
      });
    });

    const visibleSlots = available.filter((minutes) => minutes % 30 === 0);

    return visibleSlots.map((minutes) => minutesToColombiaHour(minutes));
  }
}
