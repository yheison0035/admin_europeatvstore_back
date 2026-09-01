import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { applyLoyaltyVisit } from '@/common/loyalty.util';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/prisma.service';
import { MailService } from '@/mail/mail.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Role, Status, Prisma } from '@prisma/client';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

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
        crmFont: true,
        terminology: true,
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
        // Correo propio del negocio (sin la contraseña).
        mailHost: true,
        mailPort: true,
        mailUser: true,
        mailFromName: true,
        mailFromEmail: true,
      },
    });
    // ¿Tiene correo listo para enviar? (host + usuario + contraseña).
    const withPass: any = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      omit: { mailPassword: false },
    });
    const mailConfigured = !!(
      withPass?.mailHost &&
      withPass?.mailUser &&
      withPass?.mailPassword
    );
    return { success: true, data: { ...company, mailConfigured } };
  }

  // Correo propio del negocio (SMTP). La contraseña solo se actualiza si viene
  // (para no borrarla al guardar el resto). Enviar '' explícito la limpia.
  async updateMailConfig(
    user: any,
    dto: {
      mailHost?: string | null;
      mailPort?: number | null;
      mailUser?: string | null;
      mailPassword?: string;
      mailFromName?: string | null;
      mailFromEmail?: string | null;
    },
  ) {
    const data: any = {
      mailHost: dto.mailHost?.trim() || null,
      mailPort: dto.mailPort ? Number(dto.mailPort) : null,
      mailUser: dto.mailUser?.trim() || null,
      mailFromName: dto.mailFromName?.trim() || null,
      mailFromEmail: dto.mailFromEmail?.trim() || null,
    };
    // La contraseña solo se toca si el campo viene definido en el DTO.
    if (dto.mailPassword !== undefined) {
      data.mailPassword = dto.mailPassword ? dto.mailPassword : null;
    }
    await this.prisma.company.update({
      where: { id: user.companyId },
      data,
    });
    return this.getOwnSettings(user);
  }

  // Pasarela Wompi PROPIA de la tienda del negocio. Devuelve la llave pública y
  // banderas de si los secretos están puestos (nunca los secretos en sí).
  async getWompiConfig(user: any) {
    const c: any = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      omit: {
        wompiIntegritySecret: false,
        wompiEventsSecret: false,
        wompiPrivateKey: false,
      },
    });
    return {
      success: true,
      data: {
        wompiEnabled: !!c?.wompiEnabled,
        wompiPublicKey: c?.wompiPublicKey || '',
        hasIntegrity: !!c?.wompiIntegritySecret,
        hasEvents: !!c?.wompiEventsSecret,
        hasPrivate: !!c?.wompiPrivateKey,
      },
    };
  }

  // Guarda la config de Wompi del negocio. Cada secreto solo se actualiza si
  // viene en el DTO (para no borrarlo al reguardar). '' explícito lo limpia.
  async updateWompiConfig(
    user: any,
    dto: {
      wompiEnabled?: boolean;
      wompiPublicKey?: string | null;
      wompiIntegritySecret?: string;
      wompiEventsSecret?: string;
      wompiPrivateKey?: string;
    },
  ) {
    const data: any = {};
    if (dto.wompiPublicKey !== undefined) {
      data.wompiPublicKey = dto.wompiPublicKey?.trim() || null;
    }
    if (dto.wompiIntegritySecret !== undefined) {
      data.wompiIntegritySecret = dto.wompiIntegritySecret?.trim() || null;
    }
    if (dto.wompiEventsSecret !== undefined) {
      data.wompiEventsSecret = dto.wompiEventsSecret?.trim() || null;
    }
    if (dto.wompiPrivateKey !== undefined) {
      data.wompiPrivateKey = dto.wompiPrivateKey?.trim() || null;
    }

    // Estado que quedará tras aplicar los cambios (para validar el encendido).
    const current: any = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      omit: {
        wompiIntegritySecret: false,
        wompiEventsSecret: false,
        wompiPrivateKey: false,
      },
    });
    const finalPublic =
      data.wompiPublicKey !== undefined
        ? data.wompiPublicKey
        : current?.wompiPublicKey;
    const finalIntegrity =
      data.wompiIntegritySecret !== undefined
        ? data.wompiIntegritySecret
        : current?.wompiIntegritySecret;
    const finalEvents =
      data.wompiEventsSecret !== undefined
        ? data.wompiEventsSecret
        : current?.wompiEventsSecret;

    if (dto.wompiEnabled !== undefined) {
      if (
        dto.wompiEnabled &&
        (!finalPublic || !finalIntegrity || !finalEvents)
      ) {
        throw new BadRequestException(
          'Para activar los pagos necesitas la llave pública, el secreto de integridad y el secreto de eventos de Wompi.',
        );
      }
      data.wompiEnabled = dto.wompiEnabled;
    }

    await this.prisma.company.update({
      where: { id: user.companyId },
      data,
    });
    return this.getWompiConfig(user);
  }

  // Envía un correo de prueba con el SMTP guardado de la empresa al destinatario.
  async sendMailTest(user: any, to: string) {
    const c: any = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      omit: { mailPassword: false },
    });
    if (!c?.mailHost || !c?.mailUser || !c?.mailPassword) {
      throw new BadRequestException(
        'Primero configura y guarda tu correo (host, usuario y contraseña).',
      );
    }
    try {
      await this.mail.sendTest(
        to,
        {
          host: c.mailHost,
          port: c.mailPort,
          user: c.mailUser,
          pass: c.mailPassword,
          fromEmail: c.mailFromEmail || c.mailUser,
          fromName: c.mailFromName || c.websiteName || c.name,
        },
        c.websiteName || c.name || 'Tu tienda',
      );
    } catch (e: any) {
      throw new BadRequestException(
        `No se pudo enviar: ${e?.message || 'revisa los datos del correo'}`,
      );
    }
    return { success: true, message: `Correo de prueba enviado a ${to}.` };
  }

  // Config fiscal mínima para el punto de venta (accesible a cualquier vendedor,
  // no solo dueño/admin): el POS la necesita para mostrar el IVA y el total real
  // a cobrar. Devuelve solo lo justo, nunca datos sensibles de facturación.
  async getFiscalConfig(user: any) {
    const c = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        responsableIVA: true,
        preciosIncluyenIVA: true,
        defaultTaxRate: true,
      },
    });
    return {
      success: true,
      data: c || {
        responsableIVA: false,
        preciosIncluyenIVA: true,
        defaultTaxRate: 0,
      },
    };
  }

  // Overrides de vocabulario propios de la empresa (se fusionan sobre los
  // términos por tipo de negocio en el frontend con getTerms).
  async updateTerminology(user: any, dto: any) {
    const ALLOWED = [
      'attendant',
      'attendantPlural',
      'service',
      'servicePlural',
      'product',
      'productPlural',
      'sale',
      'salePlural',
      'appointment',
      'appointmentPlural',
      'customer',
      'customerPlural',
      'catalogLabel',
    ];
    const clean: Record<string, string> = {};
    if (dto && typeof dto === 'object') {
      for (const k of ALLOWED) {
        const v = dto[k];
        if (typeof v === 'string' && v.trim()) {
          clean[k] = v.trim().slice(0, 40);
        }
      }
    }
    const company = await this.prisma.company.update({
      where: { id: user.companyId },
      data: { terminology: Object.keys(clean).length ? clean : Prisma.DbNull },
      select: { terminology: true },
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

    // Reproduce el historial por cliente. Al llegar al tope, el cliente queda
    // "graduado" (completed) y ya no acumula (fidelización solo para los
    // primeros cortes).
    const state = new Map<
      number,
      { stamps: number; last: Date | null; completed: boolean }
    >();
    for (const s of sales) {
      const cid = s.customerId as number;
      const cur = state.get(cid) || { stamps: 0, last: null, completed: false };
      if (cur.completed) {
        state.set(cid, { ...cur, last: new Date(s.saleDate) });
        continue;
      }
      const r = applyLoyaltyVisit(
        company as any,
        {
          loyaltyStamps: cur.stamps,
          loyaltyLastVisit: cur.last,
          loyaltyCompleted: false,
        },
        new Date(s.saleDate),
      );
      state.set(cid, {
        stamps: r.newCount,
        last: new Date(s.saleDate),
        completed: r.completed,
      });
    }

    // Reinicia a cero los clientes de la empresa que no tuvieron ventas (para
    // que un re-cálculo sea consistente) y aplica el estado calculado.
    const ops: any[] = [];
    for (const [cid, st] of state) {
      ops.push(
        this.prisma.customer.update({
          where: { id: cid },
          data: {
            loyaltyStamps: st.stamps,
            loyaltyLastVisit: st.last,
            loyaltyCompleted: st.completed,
          },
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
    const allowed = [
      'orange',
      'blue',
      'emerald',
      'rose',
      'violet',
      'cyan',
      'graphite',
      'indigo',
      'wine',
    ];
    const value = allowed.includes(theme) ? theme : 'orange';
    const company = await this.prisma.company.update({
      where: { id: user.companyId },
      data: { crmTheme: value },
      select: { crmTheme: true },
    });
    return { success: true, data: company };
  }

  async updateCrmFont(user: any, font: string) {
    const allowed = [
      'system',
      'inter',
      'roboto',
      'poppins',
      'montserrat',
      'opensans',
      'lato',
      'nunito',
      'dmsans',
      'worksans',
      'jakarta',
    ];
    const value = allowed.includes(font) ? font : 'system';
    const company = await this.prisma.company.update({
      where: { id: user.companyId },
      data: { crmFont: value },
      select: { crmFont: true },
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

    // Se buscan ANTES de suspender para poder avisar al dueño por correo.
    const overdue = await this.prisma.company.findMany({
      where: { status: Status.ACTIVO, paidUntil: { lt: now } },
      select: {
        id: true,
        name: true,
        monthlyPrice: true,
        paidUntil: true,
        users: {
          where: {
            role: Role.SUPER_ADMIN,
            status: { not: Status.ELIMINADO },
          },
          select: { email: true, name: true },
          take: 1,
        },
      },
    });

    if (overdue.length === 0) return;

    const result = await this.prisma.company.updateMany({
      where: { status: Status.ACTIVO, paidUntil: { lt: now } },
      data: { status: Status.INACTIVO },
    });

    this.logger.warn(
      `Auto-suspensión: ${result.count} empresa(s) vencida(s) desactivada(s).`,
    );

    // Aviso "venció / acceso suspendido" al dueño (no bloquea la suspensión).
    for (const c of overdue) {
      const owner = c.users[0];
      if (!owner?.email || !c.paidUntil) continue;
      const days = this.daysBetween(now, c.paidUntil); // negativo (ya venció)
      void this.mail
        .sendRenewalReminder(owner.email, {
          ownerName: owner.name,
          companyName: c.name,
          paidUntil: c.paidUntil,
          daysLeft: days,
          price: c.monthlyPrice,
          whatsappUrl: this.buildRenewalWa(c.name, true),
        })
        .catch((e) =>
          this.logger.warn(
            `No se pudo enviar aviso de vencimiento a ${owner.email}: ${e?.message || e}`,
          ),
        );
    }
  }

  // RECORDATORIO PREVIO: cada día se avisa al dueño de las empresas cuyo plan
  // está por vencer (7, 3 y 1 días antes). Solo empresas activas con paidUntil.
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendRenewalReminders() {
    const REMIND_DAYS = new Set([7, 3, 1]);
    const now = new Date();

    const companies = await this.prisma.company.findMany({
      where: { status: Status.ACTIVO, paidUntil: { not: null } },
      select: {
        id: true,
        name: true,
        monthlyPrice: true,
        paidUntil: true,
        users: {
          where: {
            role: Role.SUPER_ADMIN,
            status: { not: Status.ELIMINADO },
          },
          select: { email: true, name: true },
          take: 1,
        },
      },
    });

    let sent = 0;
    for (const c of companies) {
      if (!c.paidUntil) continue;
      const days = this.daysBetween(now, c.paidUntil);
      if (!REMIND_DAYS.has(days)) continue; // solo en 7 / 3 / 1 días antes
      const owner = c.users[0];
      if (!owner?.email) continue;
      try {
        await this.mail.sendRenewalReminder(owner.email, {
          ownerName: owner.name,
          companyName: c.name,
          paidUntil: c.paidUntil,
          daysLeft: days,
          price: c.monthlyPrice,
          whatsappUrl: this.buildRenewalWa(c.name, false),
        });
        sent++;
      } catch (e: any) {
        this.logger.warn(
          `No se pudo enviar recordatorio a ${owner.email}: ${e?.message || e}`,
        );
      }
    }

    if (sent > 0) {
      this.logger.log(`Recordatorios de renovación enviados: ${sent}.`);
    }
  }

  // Diferencia en días calendario (fecha - hoy). Negativo si ya pasó.
  private daysBetween(now: Date, target: Date | string): number {
    const t = new Date(target);
    const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const b = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((b.getTime() - a.getTime()) / 86_400_000);
  }

  // Enlace de WhatsApp a Pegazo con el mensaje de renovación ya armado.
  private buildRenewalWa(companyName: string, expired: boolean): string {
    const nombre = companyName || 'mi negocio';
    const msg = expired
      ? `Hola, soy de "${nombre}" y quiero renovar mi plan de Pegazo (ya venció).`
      : `Hola, soy de "${nombre}" y quiero renovar mi plan de Pegazo antes de que venza.`;
    return `https://wa.me/573186356609?text=${encodeURIComponent(msg)}`;
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
          plan: true,
          paidUntil: true,
          startDate: true,
          createdAt: true,
          monthlyPrice: true,
          discountedPrice: true,
          discountUntil: true,
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
    const pending = companies.filter(
      (c) => c.status === Status.PENDIENTE,
    ).length;
    const overdue = companies.filter(
      (c) => c.paidUntil && new Date(c.paidUntil) < now,
    ).length;

    // Precio efectivo/mes: si hay descuento vigente se usa ese, si no el normal.
    const effPrice = (c: (typeof companies)[number]) => {
      if (
        c.discountedPrice != null &&
        c.discountUntil &&
        new Date(c.discountUntil) > now
      ) {
        return c.discountedPrice;
      }
      return c.monthlyPrice ?? 0;
    };

    // MRR = ingreso recurrente mensual de las empresas ACTIVAS.
    const mrr = companies
      .filter((c) => c.status === Status.ACTIVO)
      .reduce((sum, c) => sum + effPrice(c), 0);
    const arr = mrr * 12;

    // Ingreso en riesgo: empresas vencidas (paidUntil pasado) que aún no se
    // suspenden o que ya cayeron por impago.
    const revenueAtRisk = companies
      .filter((c) => c.paidUntil && new Date(c.paidUntil) < now)
      .reduce((sum, c) => sum + effPrice(c), 0);

    // Desglose por tipo de negocio (solo cuenta las que dejan ingreso/activas
    // no; aquí contamos todas las no eliminadas para ver la mezcla del portafolio).
    const byTypeMap = new Map<string, number>();
    for (const c of companies) {
      byTypeMap.set(c.type, (byTypeMap.get(c.type) ?? 0) + 1);
    }
    const byType = [...byTypeMap.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // Desglose por plan (null -> "Sin plan").
    const byPlanMap = new Map<string, number>();
    for (const c of companies) {
      const key = c.plan || 'Sin plan';
      byPlanMap.set(key, (byPlanMap.get(key) ?? 0) + 1);
    }
    const byPlan = [...byPlanMap.entries()]
      .map(([plan, count]) => ({ plan, count }))
      .sort((a, b) => b.count - a.count);

    // Crecimiento: altas por mes en los últimos 6 meses (por startDate o, si no,
    // createdAt). Se devuelven ordenadas del mes más antiguo al actual.
    const months: { key: string; label: string; count: number }[] = [];
    const monthLabels = [
      'Ene',
      'Feb',
      'Mar',
      'Abr',
      'May',
      'Jun',
      'Jul',
      'Ago',
      'Sep',
      'Oct',
      'Nov',
      'Dic',
    ];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        key,
        label: `${monthLabels[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        count: 0,
      });
    }
    for (const c of companies) {
      const created = c.startDate ?? c.createdAt;
      if (!created) continue;
      const d = new Date(created);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = months.find((m) => m.key === key);
      if (bucket) bucket.count += 1;
    }

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
          pending,
          overdue,
          users: totalUsers,
          locals: totalLocals,
          mrr,
          arr,
          revenueAtRisk,
        },
        byType,
        byPlan,
        growth: months,
        expiringSoon,
      },
    };
  }

  // VISTA 360° de una empresa (para el rol plataforma): todo de un vistazo sin
  // impersonar — datos, plan/cobro, tienda, usuarios y ventas del mes.
  async companyDetail(user: any, id: number) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }

    const company = await this.prisma.company.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        logo: true,
        type: true,
        status: true,
        phone: true,
        email: true,
        manager: true,
        plan: true,
        paidUntil: true,
        startDate: true,
        createdAt: true,
        monthlyPrice: true,
        discountedPrice: true,
        discountUntil: true,
        enabledModules: true,
        bankNotifyEnabled: true,
        electronicInvoicingEnabled: true,
        wompiEnabled: true,
        wompiPublicKey: true,
        websiteEnabled: true,
        websiteName: true,
        domain: true,
        crmTheme: true,
      },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');

    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [users, locals, salesMonth, salesMonthPaid] = await Promise.all([
      this.prisma.user.findMany({
        where: { companyId: id, status: { not: Status.ELIMINADO } },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          localId: true,
        },
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.local.findMany({
        where: { companyId: id, status: { not: Status.ELIMINADO } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.sale.aggregate({
        where: { local: { companyId: id }, createdAt: { gte: startMonth } },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.sale.aggregate({
        where: {
          local: { companyId: id },
          createdAt: { gte: startMonth },
          paymentStatus: 'PAGADA' as any,
        },
        _sum: { totalAmount: true },
      }),
    ]);

    const daysLeft = company.paidUntil
      ? Math.ceil(
          (new Date(company.paidUntil).getTime() - now.getTime()) / 86_400_000,
        )
      : null;

    return {
      success: true,
      data: {
        company,
        billing: {
          plan: company.plan,
          paidUntil: company.paidUntil,
          daysLeft,
          overdue: daysLeft !== null && daysLeft < 0,
          monthlyPrice: company.monthlyPrice,
          discountedPrice: company.discountedPrice,
          discountUntil: company.discountUntil,
        },
        counts: {
          users: users.length,
          locals: locals.length,
        },
        locals,
        salesMonth: {
          count: salesMonth._count._all,
          total: salesMonth._sum.totalAmount || 0,
          paidTotal: salesMonthPaid._sum.totalAmount || 0,
        },
        users,
      },
    };
  }

  // Renovar/registrar el pago manual de una empresa: extiende paidUntil +N días
  // (por defecto 30) desde hoy o desde la fecha vigente si aún no ha vencido.
  async renewCompany(user: any, id: number, days = 30) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }
    const company = await this.prisma.company.findUnique({
      where: { id },
      select: { id: true, paidUntil: true, status: true },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');

    const now = new Date();
    const from =
      company.paidUntil && new Date(company.paidUntil) > now
        ? new Date(company.paidUntil)
        : now;
    const paidUntil = new Date(from.getTime() + days * 86_400_000);

    const updated = await this.prisma.company.update({
      where: { id },
      data: {
        paidUntil,
        // Si estaba suspendida por impago, al renovar se reactiva.
        ...(company.status === Status.INACTIVO && { status: Status.ACTIVO }),
      },
      select: { id: true, paidUntil: true, status: true },
    });
    return { success: true, data: updated };
  }

  // AUDITORÍA GLOBAL: últimos accesos de soporte (impersonaciones).
  async platformAudit(user: any, query: any = {}) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }
    const take = Math.min(Number(query.limit) || 50, 200);
    const logs = await this.prisma.impersonationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
    return { success: true, data: logs };
  }

  // ACTIVIDAD GLOBAL: últimos movimientos (creado/editado/eliminado) de TODAS
  // las empresas, con el nombre de la empresa resuelto.
  async platformActivity(user: any, query: any = {}) {
    if (user.role !== Role.SUPER_PLATFORM_ADMIN) {
      throw new ForbiddenException('No tienes permisos');
    }
    const take = Math.min(Number(query.limit) || 60, 200);
    const where: any = {};
    if (query.companyId) where.companyId = Number(query.companyId);
    if (query.entity) where.entity = String(query.entity);

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        entity: true,
        entityId: true,
        action: true,
        userName: true,
        companyId: true,
        createdAt: true,
      },
    });

    const companyIds = [...new Set(logs.map((l) => l.companyId))];
    const companies = await this.prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(companies.map((c) => [c.id, c.name]));

    return {
      success: true,
      data: logs.map((l) => ({
        ...l,
        companyName: nameById.get(l.companyId) || `#${l.companyId}`,
      })),
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

    // Consignaciones: al activar por primera vez, generamos el token del webhook.
    const bankPatch: any = {};
    if (dto.bankNotifyEnabled !== undefined) {
      bankPatch.bankNotifyEnabled = dto.bankNotifyEnabled;
      if (dto.bankNotifyEnabled && !found.bankNotifyToken) {
        bankPatch.bankNotifyToken = randomBytes(24).toString('hex');
      }
    }

    const updated = await this.prisma.company.update({
      where: { id },
      data: {
        ...bankPatch,
        ...(dto.electronicInvoicingEnabled !== undefined && {
          electronicInvoicingEnabled: dto.electronicInvoicingEnabled,
        }),
        ...(dto.crmTheme !== undefined && { crmTheme: dto.crmTheme }),
        ...(dto.crmFont !== undefined && { crmFont: dto.crmFont }),
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
        // Control manual de módulos + precio/descuento (superplatform).
        ...(dto.enabledModules !== undefined && {
          enabledModules: Array.isArray(dto.enabledModules)
            ? dto.enabledModules
            : [],
        }),
        ...(dto.monthlyPrice !== undefined && {
          monthlyPrice:
            dto.monthlyPrice === null ? null : Number(dto.monthlyPrice),
        }),
        ...(dto.discountedPrice !== undefined && {
          discountedPrice:
            dto.discountedPrice === null ? null : Number(dto.discountedPrice),
        }),
        ...(dto.discountUntil !== undefined && {
          discountUntil: dto.discountUntil ? new Date(dto.discountUntil) : null,
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
