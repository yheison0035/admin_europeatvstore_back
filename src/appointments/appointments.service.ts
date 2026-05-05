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

    if (query.barberId) where.barberId = Number(query.barberId);
    if (query.serviceId) where.serviceId = Number(query.serviceId);
    if (query.localId) where.localId = Number(query.localId);
    if (query.status) where.status = query.status;
    if (query.startTime) where.startTime = query.startTime;

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

  // Devuelve los horarios disponibles para un barbero, fecha y servicio dado
  async getAvailability(query: any) {
    const { barberId, date, serviceId } = query;

    if (!barberId || !date || !serviceId) {
      throw new BadRequestException('Faltan datos');
    }

    // 1. Obtener servicio (duración)
    const service = await this.prisma.service.findUnique({
      where: { id: Number(serviceId) },
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    const duration = service.duration;

    // 2. Horario laboral (10:00 AM - 8:00 PM)
    const startHour = 10;
    const endHour = 20;

    // intervalos internos en minutos (precisión)
    const interval = 10;

    const slots: number[] = [];

    for (let m = startHour * 60; m < endHour * 60; m += interval) {
      slots.push(m);
    }

    // 3. Obtener TODAS las citas del barbero
    const appointments = await this.prisma.appointment.findMany({
      where: {
        barberId: Number(barberId),
      },
      include: {
        service: true,
      },
    });

    // 4. FILTRAR SOLO LAS DEL DÍA (sin problemas de timezone)
    const sameDayAppointments = appointments.filter((a) => {
      const appointmentDate = a.date.toISOString().split('T')[0];
      return appointmentDate === date;
    });

    // 5. NORMALIZAR CITAS A MINUTOS
    const normalizedAppointments = sameDayAppointments.map((a) => {
      const start = timeToMinutes(a.startTime);
      const end = start + a.service.duration;

      return { start, end };
    });

    // 6. FILTRAR DISPONIBILIDAD REAL
    const available = slots.filter((slotStart) => {
      const slotEnd = slotStart + duration;

      // no permitir citas que se salgan del horario
      if (slotEnd > endHour * 60) return false;

      // validar cruce con citas existentes
      return !normalizedAppointments.some((a) => {
        return slotStart < a.end && slotEnd > a.start;
      });
    });

    // 7. SOLO MOSTRAR HORAS VISIBLES (cada 30 min)
    const visibleSlots = available.filter((m) => m % 30 === 0);

    // 8. FORMATEAR A COLOMBIA
    return visibleSlots.map((m) => minutesToColombiaHour(m));
  }
}
