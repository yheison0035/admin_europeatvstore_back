import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '@/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { applyLocalFilter } from '@/common/local-filter.util';
import { PlanLimitsService } from '@/common/plan-limits.service';
import { getAccessibleLocalIds } from '@/common/access-locals.util';
import { minutesToColombiaHour, timeToMinutes } from '@/utils/format';
import { AuditService } from '@/audit/audit.service';
import { PushService } from '@/push/push.service';

// Colombia es UTC-5 fijo (sin horario de verano).
const COLOMBIA_OFFSET_MIN = 300;
// Estados "activos" que pueden avanzar automáticamente con el tiempo.
const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDIENTE,
  AppointmentStatus.CONFIRMADA,
  AppointmentStatus.EN_PROCESO,
];

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private planLimits: PlanLimitsService,
    private push: PushService,
  ) {}

  // Instante UTC real de inicio de una cita. `date` se guarda como medianoche
  // UTC del día (calendario Colombia) y `startTime` es la hora local Colombia,
  // así que sumamos los minutos locales + el offset de Colombia.
  private startInstant(date: Date, startTime: string): Date {
    const localMin = timeToMinutes(startTime);
    return new Date(
      date.getTime() + (localMin + COLOMBIA_OFFSET_MIN) * 60000,
    );
  }

  // Medianoche UTC del día de hoy en calendario Colombia (base de `date`).
  private colombiaTodayMidnightUtc(): Date {
    const col = new Date(Date.now() - COLOMBIA_OFFSET_MIN * 60000);
    return new Date(
      Date.UTC(col.getUTCFullYear(), col.getUTCMonth(), col.getUTCDate()),
    );
  }

  async findAllPaginated(user: any, query: any) {
    // Antes de listar, actualiza estados vencidos de esta empresa para que la
    // tabla siempre refleje EN_PROCESO / COMPLETADA sin esperar al cron.
    await this.runAutoTransitions(user.companyId).catch(() => null);

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

    // BLINDAJE: el barbero/profesional SOLO puede ver SUS citas, pase lo que
    // pase por el filtro. Esto sobreescribe cualquier query.barberId.
    const isBarberRole = ['BARBERO', 'PROFESIONAL'].includes(user.role);
    if (isBarberRole) {
      where.barberId = user.id;
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

    if (query.status) {
      where.status = query.status;
    } else if (isBarberRole) {
      // Por defecto, al barbero solo le mostramos lo pendiente por hacer
      // (confirmadas / pendientes / en proceso), no las completadas ni las de
      // no-asistió. Si filtra por un estado puntual, se respeta.
      where.status = {
        in: [
          AppointmentStatus.CONFIRMADA,
          AppointmentStatus.PENDIENTE,
          AppointmentStatus.EN_PROCESO,
        ],
      };
    }

    if (query.startTime) {
      where.startTime = { contains: query.startTime, mode: 'insensitive' };
    }

    if (query.notes) {
      where.notes = { contains: query.notes, mode: 'insensitive' };
    }

    if (query.date) {
      const raw = String(query.date).trim();
      let y: number | undefined;
      let m: number | undefined;
      let d: number | undefined;

      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        [y, m, d] = raw.slice(0, 10).split('-').map(Number);
      } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
        [d, m, y] = raw.split('/').map(Number);
      }

      if (y && m && d) {
        // date es solo fecha (medianoche UTC): rango del día en UTC.
        const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
        const end = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0));
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
        // Todas (incluido el barbero) de la más reciente a la menos reciente.
        orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
      }),
      this.prisma.appointment.count({ where }),
    ]);

    const auditMap = await this.audit.latestFor(
      'appointment',
      items.map((a) => a.id),
      user.companyId,
    );

    return {
      success: true,
      data: items.map((a) => ({ ...a, lastAudit: auditMap[a.id] || null })),
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
    await this.planLimits.assertModule(user.companyId, 'appointments');

    // El servicio debe ser de la empresa del usuario.
    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, companyId: user.companyId },
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    // El barbero, el cliente y el local también deben pertenecer a la empresa.
    const [barber, customer, local] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: dto.barberId, companyId: user.companyId },
        select: { id: true },
      }),
      dto.customerId
        ? this.prisma.customer.findFirst({
            where: { id: dto.customerId, companyId: user.companyId },
            select: { id: true },
          })
        : Promise.resolve(null),
      this.prisma.local.findFirst({
        where: { id: dto.localId, companyId: user.companyId },
        select: { id: true },
      }),
    ]);
    if (!barber) throw new NotFoundException('Profesional no encontrado');
    if (dto.customerId && !customer) {
      throw new NotFoundException('Cliente no encontrado');
    }
    if (!local) throw new NotFoundException('Local no encontrado');

    const startMinutes = timeToMinutes(dto.startTime);
    const endMinutes = startMinutes + service.duration;

    // El conflicto de horario se busca solo dentro de la misma empresa.
    const appointments = await this.prisma.appointment.findMany({
      where: {
        barberId: dto.barberId,
        date: new Date(dto.date),
        companyId: user.companyId,
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

    const created = await this.prisma.appointment.create({
      data: {
        date: new Date(dto.date),
        startTime: dto.startTime,
        notes: dto.notes,
        serviceId: dto.serviceId,
        barberId: dto.barberId,
        customerId: dto.customerId,
        localId: dto.localId,
        companyId: user.companyId,
        // Toda cita nace CONFIRMADA salvo que se elija otro estado en el form.
        status: dto.status || AppointmentStatus.CONFIRMADA,
      },
    });

    await this.audit.log({
      entity: 'appointment',
      entityId: created.id,
      action: 'CREATE',
      user,
    });

    // Aviso push al barbero de su nueva cita (si no la creó él mismo).
    if (dto.barberId && dto.barberId !== user.id) {
      void this.notifyBarberNewAppointment(created, user.companyId).catch(
        () => null,
      );
    }

    return created;
  }

  // Construye y envía la notificación "Nueva cita" al barbero asignado.
  private async notifyBarberNewAppointment(appt: any, companyId: number) {
    const [service, customer] = await Promise.all([
      appt.serviceId
        ? this.prisma.service.findUnique({
            where: { id: appt.serviceId },
            select: { name: true },
          })
        : null,
      appt.customerId
        ? this.prisma.customer.findUnique({
            where: { id: appt.customerId },
            select: { name: true },
          })
        : null,
    ]);
    const fecha = new Date(appt.date).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
    });
    const partes = [
      customer?.name,
      service?.name,
      `${fecha} ${appt.startTime || ''}`.trim(),
    ].filter(Boolean);
    await this.push.sendToUser(appt.barberId, {
      title: '✂️ Nueva cita asignada',
      body: partes.join(' · ') || 'Tienes una nueva cita.',
      url: '/dashboard/appointments',
      tag: `appt-${appt.id}`,
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

    const updated = await this.prisma.appointment.update({
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

    const changes = this.audit.diff(appt, dto, [
      'date',
      'startTime',
      'status',
      'notes',
      'serviceId',
      'barberId',
      'customerId',
      'localId',
    ]);
    await this.audit.log({
      entity: 'appointment',
      entityId: id,
      action: 'UPDATE',
      user,
      changes,
    });

    return updated;
  }

  // Marca (o desmarca) que la cita fue confirmada con el cliente.
  async setClientConfirmed(id: number, confirmed: boolean, user: any) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!appt) throw new NotFoundException('Cita no encontrada');

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { clientConfirmed: confirmed },
    });

    const changes = this.audit.diff(appt, { clientConfirmed: confirmed }, [
      'clientConfirmed',
    ]);
    await this.audit.log({
      entity: 'appointment',
      entityId: id,
      action: 'UPDATE',
      user,
      changes,
    });

    return {
      success: true,
      data: { id, clientConfirmed: updated.clientConfirmed },
    };
  }

  async remove(id: number, user: any) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, companyId: user.companyId },
    });

    if (!appt) throw new NotFoundException();

    await this.prisma.appointment.delete({ where: { id } });

    await this.audit.log({
      entity: 'appointment',
      entityId: id,
      action: 'DELETE',
      user,
    });

    return { success: true };
  }

  // Avanza automáticamente los estados de las citas según la hora actual:
  //   - Llegada su hora de inicio (y aún no termina) → EN_PROCESO
  //   - Pasada su hora de fin (inicio + duración del servicio) → COMPLETADA
  // Nunca toca estados manuales/terminales (CANCELADA, NO_ASISTIO). Si se pasa
  // companyId solo procesa esa empresa; sin él, todas (uso del cron).
  async runAutoTransitions(companyId?: number) {
    const now = new Date();

    const appointments = await this.prisma.appointment.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        ...(companyId ? { companyId } : {}),
      },
      include: { service: { select: { duration: true } } },
    });

    const toEnProceso: number[] = [];
    const toCompletada: number[] = [];

    for (const a of appointments) {
      const start = this.startInstant(a.date, a.startTime);
      const end = new Date(
        start.getTime() + (a.service?.duration || 0) * 60000,
      );

      if (now >= end) {
        if (a.status !== AppointmentStatus.COMPLETADA) toCompletada.push(a.id);
      } else if (now >= start) {
        if (a.status !== AppointmentStatus.EN_PROCESO) toEnProceso.push(a.id);
      }
    }

    if (toEnProceso.length) {
      await this.prisma.appointment.updateMany({
        where: { id: { in: toEnProceso } },
        data: { status: AppointmentStatus.EN_PROCESO },
      });
    }

    if (toCompletada.length) {
      await this.prisma.appointment.updateMany({
        where: { id: { in: toCompletada } },
        data: { status: AppointmentStatus.COMPLETADA },
      });
    }

    return {
      enProceso: toEnProceso.length,
      completadas: toCompletada.length,
    };
  }

  // Cron global: mantiene los estados al día y envía los recordatorios de cita
  // al barbero (aunque nadie abra la app).
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleAutoTransitionsCron() {
    try {
      const res = await this.runAutoTransitions();
      if (res.enProceso || res.completadas) {
        this.logger.log(
          `Auto-transición: ${res.enProceso} en proceso, ${res.completadas} completadas`,
        );
      }
    } catch (e: any) {
      this.logger.error(`Auto-transición falló: ${e?.message}`);
    }
    try {
      const n = await this.sendDueReminders();
      if (n) this.logger.log(`Recordatorios de cita enviados: ${n}`);
    } catch (e: any) {
      this.logger.error(`Recordatorios de cita fallaron: ${e?.message}`);
    }
  }

  // Envía al barbero un recordatorio push de las citas próximas (dentro de los
  // siguientes ~20 min) que aún no se hayan avisado. Marca reminderSent para no
  // repetir. El corte de aviso coincide con la frecuencia del cron (5 min).
  private async sendDueReminders() {
    const now = new Date();
    const REMIND_MIN = 20;
    const startDay = this.colombiaTodayMidnightUtc();
    const appts = await this.prisma.appointment.findMany({
      where: {
        reminderSent: false,
        status: {
          in: [AppointmentStatus.CONFIRMADA, AppointmentStatus.PENDIENTE],
        },
        date: {
          gte: startDay,
          lt: new Date(startDay.getTime() + 2 * 86400000),
        },
      },
      include: {
        service: { select: { name: true } },
        customer: { select: { name: true } },
      },
    });

    const dueIds: number[] = [];
    for (const a of appts) {
      const start = this.startInstant(a.date, a.startTime);
      const mins = Math.round((start.getTime() - now.getTime()) / 60000);
      if (mins <= 0 || mins > REMIND_MIN) continue;
      dueIds.push(a.id);
      const partes = [a.customer?.name, a.service?.name, a.startTime].filter(
        Boolean,
      );
      void this.push
        .sendToUser(a.barberId, {
          title: `⏰ Cita en ${mins} min`,
          body: partes.join(' · ') || 'Tienes una cita próxima.',
          url: '/dashboard/appointments',
          tag: `appt-reminder-${a.id}`,
        })
        .catch(() => null);
    }

    if (dueIds.length) {
      await this.prisma.appointment.updateMany({
        where: { id: { in: dueIds } },
        data: { reminderSent: true },
      });
    }
    return dueIds.length;
  }

  // Agenda para el modal de inicio de sesión y los recordatorios: citas de hoy
  // y mañana (calendario Colombia), excluyendo las canceladas. Solo empresas
  // con el módulo de citas habilitado por su plan.
  async getAgenda(user: any) {
    await this.planLimits.assertModule(user.companyId, 'appointments');
    await this.runAutoTransitions(user.companyId).catch(() => null);

    const localIds = await getAccessibleLocalIds(this.prisma, user);

    const today = this.colombiaTodayMidnightUtc();
    const tomorrow = new Date(today.getTime() + 24 * 3600 * 1000);
    const dayAfter = new Date(today.getTime() + 48 * 3600 * 1000);
    // Ventana de la semana: del día actual en adelante (7 días), nunca hacia atrás.
    const weekEnd = new Date(today.getTime() + 7 * 24 * 3600 * 1000);

    const isBarber = ['BARBERO', 'PROFESIONAL'].includes(user.role);

    const where: any = {
      companyId: user.companyId,
      date: { gte: today, lt: weekEnd },
      // Nunca canceladas. Al barbero, además, NO se le muestran las completadas
      // ni las de no-asistió: solo lo que tiene pendiente por hacer.
      status: isBarber
        ? {
            in: [
              AppointmentStatus.CONFIRMADA,
              AppointmentStatus.PENDIENTE,
              AppointmentStatus.EN_PROCESO,
            ],
          }
        : { not: AppointmentStatus.CANCELADA },
    };

    applyLocalFilter(where, user, localIds);

    // El barbero/profesional solo ve SU agenda.
    if (isBarber) {
      where.barberId = user.id;
    }

    const items = await this.prisma.appointment.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, duration: true } },
        barber: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
        local: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    const tomorrowMs = tomorrow.getTime();
    const dayAfterMs = dayAfter.getTime();
    const todayList: any[] = [];
    const tomorrowList: any[] = [];
    const weekList: any[] = []; // del día actual en adelante (toda la ventana)

    for (const a of items) {
      const start = this.startInstant(a.date, a.startTime);
      const end = new Date(
        start.getTime() + (a.service?.duration || 0) * 60000,
      );

      const item = {
        id: a.id,
        status: a.status,
        startTime: a.startTime,
        notes: a.notes,
        clientConfirmed: a.clientConfirmed,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        service: a.service,
        barber: a.barber,
        customer: a.customer,
        local: a.local,
      };

      const t = a.date.getTime();
      if (t < tomorrowMs) todayList.push(item);
      else if (t < dayAfterMs) tomorrowList.push(item);
      // "Semana" incluye todo lo próximo (hoy en adelante).
      weekList.push(item);
    }

    return {
      success: true,
      data: { today: todayList, tomorrow: tomorrowList, week: weekList },
    };
  }

  // Mis citas por rango: HOY / MAÑANA / SEMANA (dom→sáb) / MES (mes actual).
  // Para el barbero/profesional va forzada a SUS citas; para el resto respeta
  // el filtro de local. Excluye canceladas.
  async myAppointments(user: any, rangeRaw?: string) {
    await this.planLimits.assertModule(user.companyId, 'appointments');
    await this.runAutoTransitions(user.companyId).catch(() => null);

    const localIds = await getAccessibleLocalIds(this.prisma, user);
    const today = this.colombiaTodayMidnightUtc();
    const DAY = 24 * 3600 * 1000;
    const range = ['today', 'tomorrow', 'week', 'month'].includes(rangeRaw || '')
      ? (rangeRaw as string)
      : 'today';

    let gte: Date;
    let lt: Date;
    if (range === 'tomorrow') {
      gte = new Date(today.getTime() + DAY);
      lt = new Date(today.getTime() + 2 * DAY);
    } else if (range === 'week') {
      const dow = today.getUTCDay(); // 0=domingo
      gte = new Date(today.getTime() - dow * DAY);
      lt = new Date(gte.getTime() + 7 * DAY);
    } else if (range === 'month') {
      gte = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
      );
      lt = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1),
      );
    } else {
      gte = today;
      lt = new Date(today.getTime() + DAY);
    }

    const where: any = {
      companyId: user.companyId,
      date: { gte, lt },
      status: { not: AppointmentStatus.CANCELADA },
    };
    applyLocalFilter(where, user, localIds);
    if (['BARBERO', 'PROFESIONAL'].includes(user.role)) {
      where.barberId = user.id;
    }

    const items = await this.prisma.appointment.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, duration: true } },
        barber: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
        local: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    const data = items.map((a) => {
      const start = this.startInstant(a.date, a.startTime);
      const end = new Date(
        start.getTime() + (a.service?.duration || 0) * 60000,
      );
      return {
        id: a.id,
        status: a.status,
        startTime: a.startTime,
        notes: a.notes,
        clientConfirmed: a.clientConfirmed,
        date: a.date.toISOString().slice(0, 10),
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        service: a.service,
        barber: a.barber,
        customer: a.customer,
        local: a.local,
      };
    });

    return { success: true, data, range };
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

    // Horario de atención configurable de la empresa (por defecto 9–20).
    const company = await this.prisma.company.findUnique({
      where: { id: service.companyId },
      select: { openHour: true, closeHour: true },
    });

    const startHour = company?.openHour ?? 9;
    const endHour = company?.closeHour ?? 20;
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
