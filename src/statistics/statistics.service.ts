import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { PlanLimitsService } from '@/common/plan-limits.service';
import { getAccessibleLocalIds } from '@/common/access-locals.util';

const TZ = 'America/Bogota';
const CONSUMIDOR_FINAL = '222222222222';

// Día calendario (Colombia) de una fecha, en formato YYYY-MM-DD.
function colombiaDay(date: Date): string {
  return new Date(date).toLocaleDateString('en-CA', { timeZone: TZ });
}

// Día de una fecha "solo día" (guardada a medianoche UTC): se lee en UTC
// para no correr el día por la conversión de zona horaria.
function utcDay(date: Date): string {
  return new Date(date).toISOString().slice(0, 10);
}

// Convierte 'YYYY-MM-DD' a los límites UTC del día en Colombia (UTC-5).
function dayStartUtc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 5, 0, 0));
}

function pct(current: number, previous: number): number {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// Etiquetas legibles de los tipos de gasto base (enum ExpenseType). Deben
// coincidir con los nombres de las categorías precargadas para que los gastos
// viejos (por enum) y los nuevos (por categoría) se agrupen bajo el mismo nombre.
const EXPENSE_TYPE_LABELS: Record<string, string> = {
  ARRIENDO: 'Arriendo',
  SERVICIOS_PUBLICOS: 'Servicios públicos',
  EMPLEADOS: 'Empleados / nómina',
  TRANSPORTE: 'Transporte',
  PEDIDOS: 'Pedidos / mercancía',
  PLAN_CELULAR: 'Plan celular',
  PLAN_INTERNET: 'Plan internet',
  ASEO: 'Aseo',
  MANTENIMIENTO: 'Mantenimiento',
  PUBLICIDAD: 'Publicidad',
  IMPUESTOS: 'Impuestos',
  COMISIONES: 'Comisiones',
  OTROS: 'Otros',
};

// Nombre a mostrar/agrupar de un gasto (en MAYÚSCULAS): su categoría
// personalizada si tiene, si no la etiqueta del enum.
function expenseCatName(e: any): string {
  return (
    e.expenseCategory?.name ||
    EXPENSE_TYPE_LABELS[e.type] ||
    e.type
  ).toUpperCase();
}

// Etiquetas de los métodos de pago base (deben coincidir con los nombres
// precargados en el catálogo, para agrupar ventas viejas y nuevas igual).
const PAYMENT_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  BANCOLOMBIA: 'Bancolombia',
  TRANSFERENCIA: 'Transferencia',
  DATAFONO: 'Datáfono',
  ADDI: 'Addi',
  CREDITO: 'Crédito (fiado)',
};

// Nombre a mostrar/agrupar del método de pago de una venta (en MAYÚSCULAS).
function paymentName(sale: any): string {
  return (
    sale.paymentMethodCatalog?.name ||
    PAYMENT_LABELS[sale.paymentMethod] ||
    sale.paymentMethod
  ).toUpperCase();
}

function topFrom(
  map: Record<string, { quantity: number; total: number }>,
  n: number,
) {
  return Object.entries(map)
    .map(([name, v]) => ({ name, quantity: v.quantity, total: v.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

function pairs(map: Record<string, number>, keyName: string) {
  return Object.entries(map)
    .map(([k, total]) => ({ [keyName]: k, total }))
    .sort((a: any, b: any) => b.total - a.total);
}

@Injectable()
export class StatisticsService {
  constructor(
    private prisma: PrismaService,
    private planLimits: PlanLimitsService,
  ) {}

  async getDashboard(user: any, dto: any) {
    await this.planLimits.assertModule(user.companyId, 'statistics');
    return this.dashboardInternal(user, dto);
  }

  // Comparación entre dos periodos (p. ej. mes A vs mes B). Reutiliza el mismo
  // cálculo del dashboard para cada rango y alinea la serie por día del periodo
  // para poder superponer las curvas en la gráfica.
  async compare(user: any, dto: any) {
    await this.planLimits.assertModule(user.companyId, 'statistics');
    const localId = dto?.localId || null;
    const a = dto?.periodA || {};
    const b = dto?.periodB || {};

    const [ra, rb] = await Promise.all([
      this.dashboardInternal(user, {
        startDate: a.startDate,
        endDate: a.endDate,
        localId,
      }),
      this.dashboardInternal(user, {
        startDate: b.startDate,
        endDate: b.endDate,
        localId,
      }),
    ]);

    // Serie alineada por índice de día (día 1, 2, 3…) para superponer A y B
    // aunque los meses tengan distinta cantidad de días.
    const maxLen = Math.max(ra.data.series.length, rb.data.series.length);
    const alignedSeries = Array.from({ length: maxLen }, (_, i) => ({
      day: i + 1,
      a: ra.data.series[i]?.ventas ?? null,
      b: rb.data.series[i]?.ventas ?? null,
      aGastos: ra.data.series[i]?.gastos ?? null,
      bGastos: rb.data.series[i]?.gastos ?? null,
    }));

    return {
      success: true,
      data: {
        a: {
          range: ra.data.range,
          summary: ra.data.summary,
          paymentMethods: ra.data.paymentMethods,
          expensesByType: ra.data.expensesByType,
          expensesDetail: ra.data.expensesDetail,
          topProducts: ra.data.topProducts,
          topServices: ra.data.topServices,
          topCustomers: ra.data.topCustomers,
        },
        b: {
          range: rb.data.range,
          summary: rb.data.summary,
          paymentMethods: rb.data.paymentMethods,
          expensesByType: rb.data.expensesByType,
          expensesDetail: rb.data.expensesDetail,
          topProducts: rb.data.topProducts,
          topServices: rb.data.topServices,
          topCustomers: rb.data.topCustomers,
        },
        series: alignedSeries,
        hasMultipleLocals: ra.data.hasMultipleLocals,
      },
    };
  }

  // Vista anual: 12 meses con ventas, gastos, costo de ventas y utilidad.
  // Base para la gráfica anual y el comparativo mensual tipo Alegra/Siigo.
  async annual(user: any, dto: any) {
    await this.planLimits.assertModule(user.companyId, 'statistics');
    const companyId = user.companyId;
    const localId = dto?.localId ? Number(dto.localId) : null;
    const year = Number(dto?.year) || new Date().getFullYear();

    const accessible = await getAccessibleLocalIds(this.prisma, user);
    let localFilter: any = {};
    if (localId) {
      localFilter =
        accessible && !accessible.includes(localId)
          ? { localId: { in: [] } }
          : { localId };
    } else if (accessible) {
      localFilter = { localId: { in: accessible } };
    }

    const start = dayStartUtc(year, 1, 1);
    const end = dayStartUtc(year + 1, 1, 1);
    const expStart = new Date(Date.UTC(year, 0, 1));
    const expEnd = new Date(Date.UTC(year + 1, 0, 1));

    const [sales, expenses] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          local: { companyId },
          ...localFilter,
          saleDate: { gte: start, lt: end },
          paymentStatus: 'PAGADA' as any,
        },
        select: {
          saleDate: true,
          totalAmount: true,
          items: {
            select: {
              quantity: true,
              inventoryVariantId: true,
              variant: {
                select: { inventory: { select: { purchasePrice: true } } },
              },
            },
          },
        },
      }),
      this.prisma.expense.findMany({
        where: {
          local: { companyId },
          ...localFilter,
          status: { not: 'ELIMINADO' as any },
          expenseDate: { gte: expStart, lt: expEnd },
        },
        select: { expenseDate: true, amount: true },
      }),
    ]);

    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      ventas: 0,
      gastos: 0,
      costoVentas: 0,
      count: 0,
    }));

    for (const s of sales) {
      const m = Number(colombiaDay(s.saleDate).slice(5, 7)) - 1;
      months[m].ventas += s.totalAmount;
      months[m].count += 1;
      for (const it of s.items) {
        if (it.inventoryVariantId && it.variant?.inventory) {
          months[m].costoVentas +=
            it.quantity * (it.variant.inventory.purchasePrice || 0);
        }
      }
    }
    for (const e of expenses) {
      const m = Number(utcDay(e.expenseDate).slice(5, 7)) - 1;
      months[m].gastos += e.amount;
    }

    const data = months.map((m) => ({
      month: m.month,
      count: m.count,
      ventas: Math.round(m.ventas),
      gastos: Math.round(m.gastos),
      costoVentas: Math.round(m.costoVentas),
      utilidadBruta: Math.round(m.ventas - m.costoVentas),
      utilidad: Math.round(m.ventas - m.gastos),
    }));

    const totals = data.reduce(
      (a, m) => ({
        ventas: a.ventas + m.ventas,
        gastos: a.gastos + m.gastos,
        costoVentas: a.costoVentas + m.costoVentas,
        utilidad: a.utilidad + m.utilidad,
        count: a.count + m.count,
      }),
      { ventas: 0, gastos: 0, costoVentas: 0, utilidad: 0, count: 0 },
    );

    return { success: true, data: { year, months: data, totals } };
  }

  // Inventario valorizado: stock actual a costo y a precio de venta, con
  // utilidad potencial y alerta de stock bajo (tipo Siigo/Alegra).
  async inventoryValuation(user: any, dto: any) {
    await this.planLimits.assertModule(user.companyId, 'statistics');
    const categoryId = dto?.categoryId ? Number(dto.categoryId) : undefined;

    const products = await this.prisma.inventory.findMany({
      where: {
        companyId: user.companyId,
        trackStock: true,
        ...(categoryId ? { categoryId } : {}),
      },
      select: {
        id: true,
        name: true,
        purchasePrice: true,
        salePrice: true,
        minStock: true,
        category: { select: { name: true } },
        variants: { where: { isActive: true }, select: { stock: true } },
      },
    });

    const items = products
      .map((p) => {
        const units = p.variants.reduce((s, v) => s + (v.stock || 0), 0);
        const valueCost = Math.round(units * (p.purchasePrice || 0));
        const valueSale = Math.round(units * (p.salePrice || 0));
        const low = (p.minStock > 0 && units <= p.minStock) || units <= 0;
        return {
          id: p.id,
          name: p.name,
          category: p.category?.name || 'Sin categoría',
          units,
          costUnit: Math.round(p.purchasePrice || 0),
          saleUnit: Math.round(p.salePrice || 0),
          valueCost,
          valueSale,
          margin: valueSale - valueCost,
          minStock: p.minStock,
          low,
        };
      })
      .sort((a, b) => b.valueCost - a.valueCost);

    const totals = items.reduce(
      (a, i) => ({
        valueCost: a.valueCost + i.valueCost,
        valueSale: a.valueSale + i.valueSale,
        margin: a.margin + i.margin,
        units: a.units + i.units,
      }),
      { valueCost: 0, valueSale: 0, margin: 0, units: 0 },
    );

    return {
      success: true,
      data: {
        items,
        totals,
        products: items.length,
        lowStockCount: items.filter((i) => i.low).length,
      },
    };
  }

  // Resumen ligero para el Home del dashboard (universal, sin gate de plan):
  // ventas de hoy (cobradas) + conteos para el checklist de primeros pasos.
  async homeSummary(user: any) {
    const companyId = user.companyId;
    const now = new Date();
    const today = colombiaDay(now);
    const [y, m, d] = today.split('-').map(Number);
    const start = dayStartUtc(y, m, d);
    const end = dayStartUtc(y, m, d + 1);

    const accessible = await getAccessibleLocalIds(this.prisma, user);
    const localFilter: any = accessible ? { localId: { in: accessible } } : {};

    const todayAgg = await this.prisma.sale.aggregate({
      where: {
        local: { companyId },
        ...localFilter,
        saleDate: { gte: start, lt: end },
        paymentStatus: 'PAGADA' as any,
      },
      _sum: { totalAmount: true },
      _count: { _all: true },
    });

    // Desglose de las ventas de HOY por medio de pago (efectivo, Bancolombia…).
    const todayByMethodRows = await this.prisma.sale.groupBy({
      by: ['paymentMethod'],
      where: {
        local: { companyId },
        ...localFilter,
        saleDate: { gte: start, lt: end },
        paymentStatus: 'PAGADA' as any,
      },
      _sum: { totalAmount: true },
    });
    const todayByMethod = todayByMethodRows
      .map((r) => ({
        method: r.paymentMethod,
        total: r._sum.totalAmount || 0,
      }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);

    const [localsCount, productsCount, servicesCount, salesEver] =
      await Promise.all([
        this.prisma.local.count({ where: { companyId } }),
        this.prisma.inventory.count({ where: { local: { companyId } } }),
        this.prisma.service.count({
          where: { companyId, status: 'ACTIVO' as any },
        }),
        this.prisma.sale.count({ where: { local: { companyId } } }),
      ]);

    // Config de la empresa para adaptar los bloques por vertical.
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { type: true, responsableIVA: true },
    });
    const isServices = ['SERVICIOS', 'ODONTOLOGIA'].includes(
      company?.type as any,
    );
    const notCanceled = {
      notIn: ['CANCELADA', 'RECHAZADA', 'DEVUELTA'] as any,
    };
    const r2 = (n: number) => Math.round(n * 100) / 100;

    // ---- Ventas de los últimos 7 días (serie para mini gráfica) ----
    const weekStart = dayStartUtc(y, m, d - 6);
    const weekRows = await this.prisma.sale.findMany({
      where: {
        local: { companyId },
        ...localFilter,
        paymentStatus: 'PAGADA' as any,
        saleDate: { gte: weekStart, lt: end },
      },
      select: { saleDate: true, totalAmount: true },
    });
    const days: { date: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      days.push({ date: colombiaDay(dayStartUtc(y, m, d - i)), total: 0 });
    }
    const dayMap = new Map(days.map((x) => [x.date, x]));
    for (const s of weekRows) {
      const b = dayMap.get(colombiaDay(s.saleDate));
      if (b) b.total += s.totalAmount || 0;
    }

    // ---- Mes en curso: ventas, IVA generado, gastos y utilidad ----
    const monthStart = dayStartUtc(y, m, 1);
    const monthSalesAgg = await this.prisma.sale.aggregate({
      where: {
        local: { companyId },
        ...localFilter,
        saleStatus: notCanceled,
        saleDate: { gte: monthStart, lt: end },
      },
      _sum: { totalAmount: true, taxTotal: true },
    });
    const expMonthStart = new Date(Date.UTC(y, m - 1, 1));
    const expMonthEnd = new Date(Date.UTC(y, m - 1, d + 1));
    const monthExpAgg = await this.prisma.expense.aggregate({
      where: {
        local: { companyId },
        ...localFilter,
        status: 'ACTIVO' as any,
        expenseDate: { gte: expMonthStart, lt: expMonthEnd },
      },
      _sum: { amount: true },
    });
    const monthSalesTotal = monthSalesAgg._sum.totalAmount || 0;
    const monthExpensesTotal = monthExpAgg._sum.amount || 0;

    // ---- Cartera vencida (fiados con vencimiento pasado y saldo pendiente) ----
    const overdueSales = await this.prisma.sale.findMany({
      where: {
        local: { companyId },
        ...localFilter,
        paymentStatus: 'FIADO' as any,
        dueDate: { lt: now },
      },
      select: { totalAmount: true, payments: { select: { amount: true } } },
    });
    let overdueTotal = 0;
    let overdueCount = 0;
    for (const s of overdueSales) {
      const paid = s.payments.reduce((a, p) => a + Number(p.amount), 0);
      const saldo = Number(s.totalAmount) - paid;
      if (saldo > 0.01) {
        overdueTotal += saldo;
        overdueCount++;
      }
    }

    // ---- Clientes por reactivar (sin volver hace >= 20 días) ----
    const cutoff = new Date(now.getTime() - 20 * 86400000);
    const grouped = await this.prisma.sale.groupBy({
      by: ['customerId'],
      where: {
        local: { companyId },
        ...localFilter,
        customerId: { not: null },
        saleStatus: notCanceled,
      },
      _max: { saleDate: true },
    });
    const cf = await this.prisma.customer.findMany({
      where: { companyId, document: CONSUMIDOR_FINAL },
      select: { id: true },
    });
    const cfIds = new Set(cf.map((c) => c.id));
    const winbackIds = grouped
      .filter(
        (g) =>
          g.customerId != null &&
          !cfIds.has(g.customerId) &&
          g._max.saleDate &&
          g._max.saleDate <= cutoff,
      )
      .map((g) => g.customerId as number);
    // Solo contamos los que tienen teléfono, porque la reactivación es por
    // WhatsApp y el modal "Por reactivar" únicamente lista esos (así el número
    // del inicio coincide con lo que se ve al abrirlo).
    const winbackCount = winbackIds.length
      ? await this.prisma.customer.count({
          where: { id: { in: winbackIds }, companyId, phone: { not: null } },
        })
      : 0;

    // ---- Cumpleaños de la próxima semana (por mes/día, ignora el año) ----
    const pairs: { mo: number; da: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const dt = new Date(Date.UTC(y, m - 1, d + i));
      pairs.push({ mo: dt.getUTCMonth() + 1, da: dt.getUTCDate() });
    }
    const bdayMonths = [...new Set(pairs.map((p) => p.mo))];
    let birthdays: { id: number; name: string; date: string }[] = [];
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ id: number; name: string; birthday: Date }>
      >(
        Prisma.sql`SELECT id, name, birthday FROM "Customer"
          WHERE "companyId" = ${companyId} AND birthday IS NOT NULL
          AND EXTRACT(MONTH FROM birthday) IN (${Prisma.join(bdayMonths)})`,
      );
      const pairSet = new Set(pairs.map((p) => `${p.mo}-${p.da}`));
      birthdays = rows
        .filter((r) => {
          const bd = new Date(r.birthday);
          return pairSet.has(`${bd.getUTCMonth() + 1}-${bd.getUTCDate()}`);
        })
        .slice(0, 6)
        .map((r) => {
          const bd = new Date(r.birthday);
          return {
            id: r.id,
            name: r.name,
            date: `${String(bd.getUTCDate()).padStart(2, '0')}/${String(
              bd.getUTCMonth() + 1,
            ).padStart(2, '0')}`,
          };
        });
    } catch (_) {
      birthdays = [];
    }

    // ---- Cumpleaños del EQUIPO (fuente única) ----
    const teamBirthdays = await this.teamBirthdays(user, y, m, d);

    // ---- Próximas citas (solo verticales de servicios/agenda) ----
    let nextAppointments: any[] = [];
    if (isServices) {
      const todayDateOnly = new Date(Date.UTC(y, m - 1, d));
      nextAppointments = await this.prisma.appointment.findMany({
        where: {
          companyId,
          ...localFilter,
          status: { in: ['PENDIENTE', 'CONFIRMADA'] as any },
          date: { gte: todayDateOnly },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        take: 5,
        select: {
          id: true,
          date: true,
          startTime: true,
          service: { select: { name: true } },
          barber: { select: { name: true } },
          customer: { select: { name: true } },
        },
      });
    }

    return {
      success: true,
      data: {
        today: {
          total: todayAgg._sum.totalAmount || 0,
          count: todayAgg._count._all,
          byMethod: todayByMethod,
        },
        setup: {
          locals: localsCount,
          products: productsCount,
          services: servicesCount,
          sales: salesEver,
        },
        weekSales: days,
        month: {
          sales: r2(monthSalesTotal),
          expenses: r2(monthExpensesTotal),
          profit: r2(monthSalesTotal - monthExpensesTotal),
        },
        iva: company?.responsableIVA
          ? { generado: r2(Number(monthSalesAgg._sum.taxTotal || 0)) }
          : null,
        overdue: { total: r2(overdueTotal), count: overdueCount },
        winbackCount,
        birthdays,
        teamBirthdays,
        nextAppointments,
      },
    };
  }

  // Serie de ventas PAGADAS para la gráfica del Home. period:
  //   'week'  → últimos 7 días (diario)
  //   'month' → últimos 30 días (diario)
  //   'year'  → últimos 12 meses (mensual)
  async salesTrend(user: any, period?: string, offsetRaw?: any) {
    const companyId = user.companyId;
    const today = colombiaDay(new Date());
    const [y, m, d] = today.split('-').map(Number);
    // offset: cuántos periodos hacia ATRÁS (0 = actual). No se permite futuro.
    const offset = Math.max(0, Math.floor(Number(offsetRaw) || 0));
    const rangeLabel = (
      buckets: { label: string }[],
    ): string =>
      buckets.length
        ? `${buckets[0].label} – ${buckets[buckets.length - 1].label}`
        : '';
    const accessible = await getAccessibleLocalIds(this.prisma, user);
    const localFilter: any = accessible ? { localId: { in: accessible } } : {};
    const baseWhere: any = {
      local: { companyId },
      ...localFilter,
      paymentStatus: 'PAGADA' as any,
    };

    // Solo dueño/administrador ven las cifras en pesos. Para los demás roles se
    // devuelve la tendencia RELATIVA (0–100) sin exponer los montos reales, así
    // ven la forma de la gráfica pero no la plata (ni siquiera en la respuesta).
    const canSeeMoney = ['SUPER_ADMIN', 'ADMIN'].includes(user.role);
    const shape = (
      buckets: { key: string; label: string; total: number }[],
    ) => {
      if (canSeeMoney) return buckets;
      const max = buckets.reduce((mx, b) => Math.max(mx, b.total), 0);
      return buckets.map((b) => ({
        key: b.key,
        label: b.label,
        total: max > 0 ? Math.round((b.total / max) * 100) : 0,
      }));
    };

    const p = period === 'month' || period === 'year' ? period : 'week';

    if (p === 'year') {
      const mShift = m - offset * 12; // desplaza 12 meses por cada offset
      const start = dayStartUtc(y, mShift - 11, 1);
      const end = dayStartUtc(y, mShift + 1, 1);
      const rows = await this.prisma.sale.findMany({
        where: { ...baseWhere, saleDate: { gte: start, lt: end } },
        select: { saleDate: true, totalAmount: true },
      });
      const MES = [
        'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
        'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
      ];
      const buckets: { key: string; label: string; total: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const dt = new Date(Date.UTC(y, mShift - 1 - i, 1));
        const mo = dt.getUTCMonth();
        const yr = dt.getUTCFullYear();
        buckets.push({
          key: `${yr}-${String(mo + 1).padStart(2, '0')}`,
          label: `${MES[mo]} ${String(yr).slice(2)}`,
          total: 0,
        });
      }
      const map = new Map(buckets.map((b) => [b.key, b]));
      for (const s of rows) {
        const key = colombiaDay(s.saleDate).slice(0, 7);
        const b = map.get(key);
        if (b) b.total += s.totalAmount || 0;
      }
      return {
        success: true,
        data: shape(buckets),
        period: p,
        values: canSeeMoney,
        offset,
        canForward: offset > 0,
        rangeLabel: rangeLabel(buckets),
      };
    }

    // week / month (diario)
    const nDays = p === 'month' ? 30 : 7;
    const dShift = d - offset * nDays; // desplaza la ventana por cada offset
    const start = dayStartUtc(y, m, dShift - (nDays - 1));
    const end = dayStartUtc(y, m, dShift + 1);
    const rows = await this.prisma.sale.findMany({
      where: { ...baseWhere, saleDate: { gte: start, lt: end } },
      select: { saleDate: true, totalAmount: true },
    });
    const buckets: { key: string; label: string; total: number }[] = [];
    for (let i = nDays - 1; i >= 0; i--) {
      const cd = colombiaDay(dayStartUtc(y, m, dShift - i)); // YYYY-MM-DD
      buckets.push({
        key: cd,
        label: `${cd.slice(8)}/${cd.slice(5, 7)}`,
        total: 0,
      });
    }
    const map = new Map(buckets.map((b) => [b.key, b]));
    for (const s of rows) {
      const b = map.get(colombiaDay(s.saleDate));
      if (b) b.total += s.totalAmount || 0;
    }
    return {
      success: true,
      data: shape(buckets),
      period: p,
      values: canSeeMoney,
      offset,
      canForward: offset > 0,
      rangeLabel: rangeLabel(buckets),
    };
  }

  // "Mi rendimiento": SOLO las ventas atribuidas al usuario que consulta
  // (Sale.userId = req.user.id). Hoy / esta semana (domingo→sábado) / este mes,
  // con ganancia según SUS comisiones (servicios y productos). Aislado: no
  // expone nada de la empresa ni de otros empleados.
  async myPerformance(user: any) {
    const uid = user.id;
    const companyId = user.companyId;
    const today = colombiaDay(new Date());
    const [y, m, d] = today.split('-').map(Number);
    const notCanceled = {
      notIn: ['CANCELADA', 'RECHAZADA', 'DEVUELTA'] as any,
    };

    // Semana domingo→sábado: día de la semana de hoy (0=domingo).
    const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
    const tStart = dayStartUtc(y, m, d);
    const tEnd = dayStartUtc(y, m, d + 1);
    const wStart = dayStartUtc(y, m, d - dow);
    const wEnd = dayStartUtc(y, m, d - dow + 7);
    // Cierre de mes del barbero: del 3 de un mes al 2 del siguiente (los
    // productos se pagan el 3), NO el mes calendario.
    const cycle = this.commissionMonth(y, m, d);
    const moStart = cycle.gte;
    const moEnd = cycle.lt;

    // Comisiones del propio usuario.
    const me = await this.prisma.user.findUnique({
      where: { id: uid },
      select: { commissionServiceRate: true, commissionProductRate: true },
    });
    const svcRate =
      me?.commissionServiceRate != null ? Number(me.commissionServiceRate) : null;
    const prodRate =
      me?.commissionProductRate != null ? Number(me.commissionProductRate) : null;

    const sumRange = async (gte: Date, lt: Date) => {
      const sales = await this.prisma.sale.findMany({
        where: {
          userId: uid,
          local: { companyId },
          paymentStatus: 'PAGADA' as any,
          saleStatus: notCanceled,
          saleDate: { gte, lt },
        },
        select: {
          id: true,
          noCommission: true,
          items: {
            select: {
              subtotal: true,
              quantity: true,
              serviceId: true,
              inventoryVariantId: true,
              variant: {
                select: {
                  inventory: {
                    select: {
                      category: { select: { earnsCommission: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      let services = 0;
      let products = 0;
      let cuts = 0; // nº de cortes/servicios realizados
      for (const s of sales) {
        // Venta sin comisión (cortesía / mal aplicada): no suma a lo que gana,
        // pero el corte sí se cuenta (lo atendió).
        const noCom = s.noCommission;
        for (const it of s.items) {
          const v = it.subtotal || 0;
          if (it.serviceId) {
            if (!noCom) services += v;
            cuts += it.quantity || 0;
          } else if (it.inventoryVariantId) {
            // Producto: solo suma a comisión si su categoría genera comisión.
            const earns =
              it.variant?.inventory?.category?.earnsCommission === true;
            if (!noCom && earns) products += v;
          }
        }
      }
      return { services, products, cuts, count: sales.length };
    };

    const r2 = (n: number) => Math.round(n * 100) / 100;
    // Ganancia (comisión) del barbero a partir de lo vendido a su nombre.
    const earn = (services: number, products: number) => {
      const s = svcRate != null ? r2((services * svcRate) / 100) : null;
      const p = prodRate != null ? r2((products * prodRate) / 100) : null;
      return { service: s, product: p, total: r2((s || 0) + (p || 0)) };
    };
    const ratesConfigured = svcRate != null && prodRate != null;

    const [tDay, wWeek, mMonth] = await Promise.all([
      sumRange(tStart, tEnd),
      sumRange(wStart, wEnd),
      sumRange(moStart, moEnd),
    ]);

    const productShare =
      mMonth.services + mMonth.products > 0
        ? Math.round(
            (mMonth.products / (mMonth.services + mMonth.products)) * 100,
          )
        : 0;

    const label = (dt: Date) =>
      `${String(dt.getUTCDate()).padStart(2, '0')}/${String(
        dt.getUTCMonth() + 1,
      ).padStart(2, '0')}`;
    const weekRange = `${label(wStart)} – ${label(new Date(wEnd.getTime() - 86400000))}`;

    const teamBirthdays = await this.teamBirthdays(user, y, m, d);

    // Cargos que afectan el pago del BARBERO. Para que el descuento NO
    // desaparezca al marcar "pagó con comisión" (y NO se repita en semanas
    // siguientes), el descuento de LA SEMANA = pendientes + los que se
    // descontaron de comisión dentro de esta misma semana.
    const chargeRows = await this.prisma.employeeCharge.findMany({
      where: {
        companyId,
        userId: uid,
        OR: [
          { status: 'PENDIENTE' },
          { status: 'DESCONTADO', settledAt: { gte: wStart } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        concept: true,
        amount: true,
        type: true,
        status: true,
        settledAt: true,
        createdAt: true,
      },
    });
    const pendingRows = chargeRows.filter((c) => c.status === 'PENDIENTE');
    const pendingTotal = r2(pendingRows.reduce((s, c) => s + c.amount, 0));
    const weekChargeDeduction = r2(
      chargeRows.reduce((s, c) => s + c.amount, 0),
    );
    const monthEarn = earn(mMonth.services, mMonth.products);
    const weekEarn = earn(wWeek.services, wWeek.products);

    return {
      success: true,
      data: {
        teamBirthdays,
        ratesConfigured,
        rates: { service: svcRate, product: prodRate },
        today: { earnings: earn(tDay.services, tDay.products), cuts: tDay.cuts },
        week: {
          earnings: weekEarn,
          cuts: wWeek.cuts,
          range: weekRange,
          // Descuento de la semana (pendientes + descontados esta semana) y el
          // neto a pagar de los cortes de la semana.
          charges: weekChargeDeduction,
          chargesList: chargeRows,
          net: r2((weekEarn.service || 0) - weekChargeDeduction),
        },
        month: {
          earnings: monthEarn,
          cuts: mMonth.cuts,
          productShare,
          range: cycle.range,
          payDay: cycle.payDay,
          charges: pendingTotal,
          chargesList: pendingRows,
          net: r2((monthEarn.total || 0) - pendingTotal),
        },
      },
    };
  }

  // Ciclo de cierre de mes del barbero: del 3 de un mes al 2 del siguiente
  // (los productos se pagan el 3), NO el mes calendario. Devuelve la ventana
  // [gte, lt) que contiene el día (y,m,d), su etiqueta con fechas y el día de
  // pago. `back` desplaza a ciclos anteriores (0 = actual, 1 = anterior, …).
  private commissionMonth(y: number, m: number, d: number, back = 0) {
    const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    // Mes ancla: si aún no llega el 3, seguimos en el ciclo del mes anterior.
    const anchor = d >= 3 ? m : m - 1;
    const gte = dayStartUtc(y, anchor - back, 3);
    const lt = dayStartUtc(y, anchor - back + 1, 3);
    const end = new Date(lt.getTime() - 86400000); // el 2 del mes siguiente
    const gy = gte.getUTCFullYear();
    const ey = end.getUTCFullYear();
    const range =
      gy === ey
        ? `3 ${MES[gte.getUTCMonth()]} – 2 ${MES[end.getUTCMonth()]} ${ey}`
        : `3 ${MES[gte.getUTCMonth()]} ${gy} – 2 ${MES[end.getUTCMonth()]} ${ey}`;
    const payDay = `3 ${MES[lt.getUTCMonth()]}`; // se paga el 3 del mes de cierre
    return { gte, lt, range, payDay };
  }

  // Historial de las últimas 8 semanas (domingo→sábado) del propio usuario, con
  // su GANANCIA (comisión), cuántos cortes y CUÁLES servicios hizo. Solo se
  // muestran montos de lo que él gana, no el bruto del negocio.
  // Comisiones del propio usuario (o null si no están configuradas).
  private async barberRates(uid: number) {
    const me = await this.prisma.user.findUnique({
      where: { id: uid },
      select: { commissionServiceRate: true, commissionProductRate: true },
    });
    const service =
      me?.commissionServiceRate != null ? Number(me.commissionServiceRate) : null;
    const product =
      me?.commissionProductRate != null ? Number(me.commissionProductRate) : null;
    return { service, product, configured: service != null && product != null };
  }

  // Trae las ventas del barbero en un rango y desglosa CORTES y PRODUCTOS con
  // cuántos, cuáles y cuánto GANA él en cada uno.
  private async barberBreakdown(
    uid: number,
    companyId: number,
    gte: Date,
    lt: Date,
    svcRate: number | null,
    prodRate: number | null,
    // La comisión de productos se paga MENSUAL: solo entra al total en el mes.
    // En día/semana el total es solo de cortes (los productos se listan aparte).
    productsInTotal = true,
  ) {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const sales = await this.prisma.sale.findMany({
      where: {
        userId: uid,
        local: { companyId },
        paymentStatus: 'PAGADA' as any,
        saleStatus: { notIn: ['CANCELADA', 'RECHAZADA', 'DEVUELTA'] as any },
        saleDate: { gte, lt },
      },
      select: {
        noCommission: true,
        items: {
          select: {
            subtotal: true,
            quantity: true,
            serviceId: true,
            inventoryVariantId: true,
            service: { select: { name: true } },
            variant: {
              select: {
                inventory: {
                  select: {
                    name: true,
                    // Solo comisiona si la categoría del producto está marcada
                    // como que genera comisión (insumos sí, cervezas no).
                    category: { select: { earnsCommission: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    type Line = { name: string; qty: number; earn: number; courtesy: boolean };
    const svc = new Map<string, Line>();
    const prod = new Map<string, Line>();
    let cuts = 0;
    let productUnits = 0;
    for (const s of sales) {
      // Venta de cortesía / mal aplicada: el corte se hizo pero NO genera
      // comisión (queda en 0). Se marca la línea para explicarlo con un icono.
      const noCom = s.noCommission;
      for (const it of s.items) {
        const gross = it.subtotal || 0;
        const qty = it.quantity || 0;
        if (it.serviceId) {
          const name = it.service?.name || 'Servicio';
          const earn = svcRate != null && !noCom ? (gross * svcRate) / 100 : 0;
          const c = svc.get(name) || { name, qty: 0, earn: 0, courtesy: false };
          c.qty += qty;
          c.earn += earn;
          if (noCom) c.courtesy = true;
          svc.set(name, c);
          cuts += qty;
        } else if (it.inventoryVariantId) {
          const name = it.variant?.inventory?.name || 'Producto';
          const earns =
            it.variant?.inventory?.category?.earnsCommission === true;
          const earn =
            prodRate != null && !noCom && earns
              ? (gross * prodRate) / 100
              : 0;
          const c = prod.get(name) || { name, qty: 0, earn: 0, courtesy: false };
          c.qty += qty;
          c.earn += earn;
          if (noCom) c.courtesy = true;
          prod.set(name, c);
          productUnits += qty;
        }
      }
    }
    const services = [...svc.values()]
      .map((x) => ({ name: x.name, qty: x.qty, earn: r2(x.earn), courtesy: x.courtesy }))
      .sort((a, b) => b.earn - a.earn);
    const products = [...prod.values()]
      .map((x) => ({ name: x.name, qty: x.qty, earn: r2(x.earn), courtesy: x.courtesy }))
      .sort((a, b) => b.earn - a.earn);
    const serviceEarn = r2(services.reduce((a, x) => a + x.earn, 0));
    const productEarn = r2(products.reduce((a, x) => a + x.earn, 0));
    return {
      cuts,
      productUnits,
      services,
      products,
      serviceEarn,
      productEarn,
      // Total mostrado: cortes siempre; productos solo si aplica (mes).
      earnings: r2(serviceEarn + (productsInTotal ? productEarn : 0)),
      productsMonthly: !productsInTotal,
    };
  }

  // Detalle del propio barbero para HOY / SEMANA (dom→sáb) / MES: qué cortes y
  // qué productos, con lo que gana en cada uno.
  async myDetail(user: any, periodRaw?: string) {
    const uid = user.id;
    const companyId = user.companyId;
    const today = colombiaDay(new Date());
    const [y, m, d] = today.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
    const lb = (dt: Date) =>
      `${String(dt.getUTCDate()).padStart(2, '0')}/${String(
        dt.getUTCMonth() + 1,
      ).padStart(2, '0')}`;

    const period =
      periodRaw === 'week' || periodRaw === 'month' ? periodRaw : 'today';
    let gte: Date;
    let lt: Date;
    let label: string;
    if (period === 'week') {
      gte = dayStartUtc(y, m, d - dow);
      lt = dayStartUtc(y, m, d - dow + 7);
      label = `${lb(gte)} – ${lb(new Date(lt.getTime() - 86400000))}`;
    } else if (period === 'month') {
      // Cierre 3→2 (no mes calendario), con fechas.
      const cycle = this.commissionMonth(y, m, d);
      gte = cycle.gte;
      lt = cycle.lt;
      label = cycle.range;
    } else {
      gte = dayStartUtc(y, m, d);
      lt = dayStartUtc(y, m, d + 1);
      label = 'Hoy';
    }

    const rates = await this.barberRates(uid);
    const bd = await this.barberBreakdown(
      uid,
      companyId,
      gte,
      lt,
      rates.service,
      rates.product,
      period === 'month', // productos al total solo en el mes
    );
    return {
      success: true,
      data: {
        period,
        label,
        ratesConfigured: rates.configured,
        rates: { service: rates.service, product: rates.product },
        ...bd,
      },
    };
  }

  // Historial del barbero agrupado por DÍA (14 últimos), SEMANA (8 últimas,
  // dom→sáb) o MES (6 últimos), con su ganancia y el desglose de cortes y
  // productos.
  async myHistory(user: any, groupRaw?: string) {
    const uid = user.id;
    const companyId = user.companyId;
    const today = colombiaDay(new Date());
    const [y, m, d] = today.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
    const lb = (dt: Date) =>
      `${String(dt.getUTCDate()).padStart(2, '0')}/${String(
        dt.getUTCMonth() + 1,
      ).padStart(2, '0')}`;

    const rates = await this.barberRates(uid);
    const group =
      groupRaw === 'month' ? 'month' : groupRaw === 'day' ? 'day' : 'week';
    const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

    // Definir primero las ventanas (label + rango) y resolver los desgloses en
    // paralelo (evita esperas secuenciales: 14 días pasan de ~5s a <1s).
    const windows: { label: string; gte: Date; lt: Date }[] = [];
    if (group === 'day') {
      for (let i = 13; i >= 0; i--) {
        const gte = dayStartUtc(y, m, d - i);
        const lt = dayStartUtc(y, m, d - i + 1);
        const wd = new Date(Date.UTC(y, m - 1, d - i, 12)).getUTCDay();
        const label =
          i === 0 ? `Hoy · ${lb(gte)}` : i === 1 ? `Ayer · ${lb(gte)}` : `${DIA[wd]} ${lb(gte)}`;
        windows.push({ label, gte, lt });
      }
    } else if (group === 'month') {
      // 6 cierres 3→2 (actual y anteriores), con sus fechas.
      for (let i = 5; i >= 0; i--) {
        const c = this.commissionMonth(y, m, d, i);
        windows.push({ label: c.range, gte: c.gte, lt: c.lt });
      }
    } else {
      for (let i = 7; i >= 0; i--) {
        const gte = dayStartUtc(y, m, d - dow - i * 7);
        const lt = dayStartUtc(y, m, d - dow - i * 7 + 7);
        windows.push({
          label: `${lb(gte)} – ${lb(new Date(lt.getTime() - 86400000))}`,
          gte,
          lt,
        });
      }
    }

    const periods = await Promise.all(
      windows.map(async (w) => ({
        label: w.label,
        ...(await this.barberBreakdown(
          uid,
          companyId,
          w.gte,
          w.lt,
          rates.service,
          rates.product,
          group === 'month', // productos al total solo en el mes
        )),
      })),
    );

    return {
      success: true,
      data: periods,
      group,
      ratesConfigured: rates.configured,
    };
  }

  // Cumpleaños del EQUIPO (usuarios del local del que consulta; si no tiene
  // local, toda la empresa). Formato "8 de agosto de 2026", ordenados por el
  // próximo en cumplir. Fuente única usada por el Home y por Mi rendimiento.
  private async teamBirthdays(user: any, y: number, m: number, d: number) {
    const MESES = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ];
    try {
      const teamRows = await this.prisma.user.findMany({
        where: {
          companyId: user.companyId,
          status: 'ACTIVO' as any,
          birthdate: { not: null },
          ...(user.localId ? { localId: user.localId } : {}),
        },
        select: { id: true, name: true, birthdate: true },
      });
      return teamRows
        .map((u) => {
          const bd = new Date(u.birthdate as Date);
          const mo = bd.getUTCMonth() + 1;
          const da = bd.getUTCDate();
          const nextIn = ((mo - m) * 31 + (da - d) + 372) % 372;
          const yr = mo > m || (mo === m && da >= d) ? y : y + 1;
          return {
            id: u.id,
            name: u.name,
            date: `${da} de ${MESES[mo - 1]} de ${yr}`,
            nextIn,
          };
        })
        .sort((a, b) => a.nextIn - b.nextIn)
        .slice(0, 15)
        .map(({ nextIn, ...rest }) => rest);
    } catch (_) {
      return [];
    }
  }

  private async dashboardInternal(user: any, dto: any) {
    const companyId = user.companyId;
    const localId = dto.localId ? Number(dto.localId) : null;

    // ---- Rango de fechas (Colombia) ----
    const today = colombiaDay(new Date());
    const endStr: string = dto.endDate || today;
    // Por defecto (sin fecha inicial), el rango arranca en la PRIMERA venta
    // registrada de la empresa; si no hay ventas, en los últimos 30 días.
    let startStr: string = dto.startDate;
    if (!startStr) {
      const firstSale = await this.prisma.sale.findFirst({
        where: {
          local: { companyId },
          saleStatus: { notIn: ['CANCELADA', 'RECHAZADA', 'DEVUELTA'] as any },
        },
        orderBy: { saleDate: 'asc' },
        select: { saleDate: true },
      });
      startStr = firstSale
        ? colombiaDay(firstSale.saleDate)
        : colombiaDay(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
    }

    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);

    const end = dayStartUtc(ey, em, ed + 1); // exclusivo (día siguiente 00:00 Col)
    let start = dayStartUtc(sy, sm, sd);

    // Tope de seguridad: máximo ~13 meses por consulta para no cargar en memoria
    // años de ventas si alguien pide un rango enorme.
    const MAX_MS = 400 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > MAX_MS) {
      start = new Date(end.getTime() - MAX_MS);
    }

    const lengthMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - lengthMs);
    const prevEnd = start;

    // Gastos: fecha "solo día" (medianoche UTC) → límites y agrupación en UTC.
    const expStart = new Date(Date.UTC(sy, sm - 1, sd, 0, 0, 0));
    const expEnd = new Date(Date.UTC(ey, em - 1, ed + 1, 0, 0, 0));
    const expLen = expEnd.getTime() - expStart.getTime();
    const prevExpStart = new Date(expStart.getTime() - expLen);
    const prevExpEnd = expStart;

    // Aislamiento por sede: un ADMIN limitado a ciertas sedes solo ve las
    // suyas. accessible = null significa acceso total (SUPER_ADMIN/COORDINADOR).
    const accessible = await getAccessibleLocalIds(this.prisma, user);
    let localFilter: any = {};
    if (localId) {
      // Si pide una sede que no gestiona, no se le devuelven datos.
      localFilter =
        accessible && !accessible.includes(localId)
          ? { localId: { in: [] } }
          : { localId };
    } else if (accessible) {
      localFilter = { localId: { in: accessible } };
    }

    // Los ingresos solo cuentan ventas realmente cobradas: se excluye el
    // fiado (y cualquier estado no pagado) hasta que la venta pase a PAGADA.
    const saleWhere = (from: Date, to: Date) => ({
      local: { companyId },
      ...localFilter,
      saleDate: { gte: from, lt: to },
      paymentStatus: 'PAGADA' as any,
    });

    const expenseWhere = (from: Date, to: Date) => ({
      local: { companyId },
      ...localFilter,
      status: { not: 'ELIMINADO' as any },
      expenseDate: { gte: from, lt: to },
    });

    const [
      sales,
      prevSales,
      expenses,
      prevExpensesAgg,
      newCustomers,
      prevNewCustomers,
      locals,
    ] = await Promise.all([
      this.prisma.sale.findMany({
        where: saleWhere(start, end),
        include: {
          user: { select: { id: true, name: true } },
          local: { select: { id: true, name: true } },
          customer: { select: { name: true, document: true } },
          paymentMethodCatalog: { select: { name: true } },
          items: {
            include: {
              service: { select: { name: true } },
              variant: {
                include: {
                  inventory: { select: { name: true, purchasePrice: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.sale.findMany({
        where: saleWhere(prevStart, prevEnd),
        select: { totalAmount: true },
      }),
      this.prisma.expense.findMany({
        where: expenseWhere(expStart, expEnd),
        select: {
          id: true,
          concept: true,
          type: true,
          amount: true,
          paymentMethod: true,
          paidTo: true,
          expenseDate: true,
          provider: { select: { name: true } },
          local: { select: { name: true } },
          expenseCategory: { select: { name: true } },
        },
        orderBy: { expenseDate: 'desc' },
      }),
      this.prisma.expense.aggregate({
        where: expenseWhere(prevExpStart, prevExpEnd),
        _sum: { amount: true },
      }),
      this.prisma.customer.count({
        where: {
          companyId,
          createdAt: { gte: start, lt: end },
          OR: [{ document: null }, { document: { not: CONSUMIDOR_FINAL } }],
        },
      }),
      this.prisma.customer.count({
        where: {
          companyId,
          createdAt: { gte: prevStart, lt: prevEnd },
          OR: [{ document: null }, { document: { not: CONSUMIDOR_FINAL } }],
        },
      }),
      this.prisma.local.findMany({
        where: { companyId },
        select: { id: true, name: true },
      }),
    ]);

    // ---- Agregaciones del periodo actual ----
    let totalSales = 0;
    let itemsSold = 0;
    const salesByDay: Record<string, number> = {};
    const paymentMap: Record<string, number> = {};
    const localMap: Record<string, number> = {};
    const sellerMap: Record<string, number> = {};
    const productMap: Record<
      string,
      { quantity: number; total: number; cost: number }
    > = {};
    const serviceMap: Record<string, { quantity: number; total: number }> = {};
    // Mejores clientes (excluye Consumidor Final).
    const customerMap: Record<string, { total: number; count: number }> = {};

    let costOfGoods = 0; // costo de la mercancía vendida (solo productos)
    for (const sale of sales) {
      totalSales += sale.totalAmount;

      if (sale.customer && sale.customer.document !== CONSUMIDOR_FINAL) {
        const cn = sale.customer.name || 'Cliente';
        if (!customerMap[cn]) customerMap[cn] = { total: 0, count: 0 };
        customerMap[cn].total += sale.totalAmount;
        customerMap[cn].count += 1;
      }
      const day = colombiaDay(sale.saleDate);
      salesByDay[day] = (salesByDay[day] || 0) + sale.totalAmount;
      const payName = paymentName(sale);
      paymentMap[payName] = (paymentMap[payName] || 0) + sale.totalAmount;
      const localName = sale.local?.name || 'Sin local';
      localMap[localName] = (localMap[localName] || 0) + sale.totalAmount;
      const seller = sale.user?.name || 'Sin asesor';
      sellerMap[seller] = (sellerMap[seller] || 0) + sale.totalAmount;

      for (const item of sale.items) {
        itemsSold += item.quantity;
        if (item.serviceId && item.service) {
          const n = item.service.name;
          if (!serviceMap[n]) serviceMap[n] = { quantity: 0, total: 0 };
          serviceMap[n].quantity += item.quantity;
          serviceMap[n].total += item.subtotal;
        }
        if (item.inventoryVariantId && item.variant?.inventory) {
          const n = item.variant.inventory.name;
          if (!productMap[n]) productMap[n] = { quantity: 0, total: 0, cost: 0 };
          const lineCost =
            item.quantity * (item.variant.inventory.purchasePrice || 0);
          productMap[n].quantity += item.quantity;
          productMap[n].total += item.subtotal;
          productMap[n].cost += lineCost;
          costOfGoods += lineCost;
        }
      }
    }

    // Gastos por tipo y por día
    const expenseTypeMap: Record<string, number> = {};
    const expensesByDay: Record<string, number> = {};
    let totalExpenses = 0;
    for (const e of expenses) {
      totalExpenses += e.amount;
      const catName = expenseCatName(e);
      expenseTypeMap[catName] = (expenseTypeMap[catName] || 0) + e.amount;
      const day = utcDay(e.expenseDate);
      expensesByDay[day] = (expensesByDay[day] || 0) + e.amount;
    }

    // Rentabilidad por producto: vendido − costo = utilidad, con margen %.
    const productProfit = Object.entries(productMap)
      .map(([name, v]) => {
        const revenue = Math.round(v.total);
        const cost = Math.round(v.cost);
        const profit = revenue - cost;
        return {
          name,
          quantity: v.quantity,
          revenue,
          cost,
          profit,
          margin: revenue ? Math.round((profit / revenue) * 100) : 0,
        };
      })
      .sort((a, b) => b.profit - a.profit);

    // Mejores clientes por monto comprado.
    const topCustomers = Object.entries(customerMap)
      .map(([name, v]) => ({
        name,
        total: Math.round(v.total),
        count: v.count,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    // Detalle de gastos del periodo (con fecha de pago) para el panel de gastos.
    const expensesDetail = expenses.map((e) => ({
      id: e.id,
      concept: e.concept,
      // Nombre de la categoría (personalizada o base) para mostrar/filtrar.
      type: expenseCatName(e),
      amount: Math.round(e.amount),
      paymentMethod: e.paymentMethod || null,
      paidTo: e.paidTo || e.provider?.name || null,
      date: e.expenseDate,
      local: e.local?.name || '—',
    }));

    // Serie temporal día a día (ingresos vs gastos)
    const series: { date: string; ventas: number; gastos: number }[] = [];
    const cursor = new Date(Date.UTC(sy, sm - 1, sd));
    const lastDay = new Date(Date.UTC(ey, em - 1, ed));
    while (cursor <= lastDay) {
      const key = cursor.toISOString().slice(0, 10);
      series.push({
        date: key,
        ventas: Math.round(salesByDay[key] || 0),
        gastos: Math.round(expensesByDay[key] || 0),
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const salesCount = sales.length;
    const avgTicket = salesCount ? totalSales / salesCount : 0;
    const profit = totalSales - totalExpenses;
    // Margen bruto = ventas - costo de la mercancía vendida (sin gastos).
    const grossMargin = totalSales - costOfGoods;
    const grossMarginPct = totalSales ? (grossMargin / totalSales) * 100 : 0;

    const prevTotalSales = prevSales.reduce((a, s) => a + s.totalAmount, 0);
    const prevSalesCount = prevSales.length;
    const prevAvgTicket = prevSalesCount ? prevTotalSales / prevSalesCount : 0;
    const prevTotalExpenses = prevExpensesAgg._sum.amount || 0;
    const prevProfit = prevTotalSales - prevTotalExpenses;

    // Por cobrar (fiado): ventas a crédito aún sin pagar. Se listan TODAS las
    // pendientes sin importar el periodo, porque una deuda vieja sigue vigente
    // hoy; respeta el filtro de sede si está activo.
    const fiadoSales = await this.prisma.sale.findMany({
      where: {
        local: { companyId },
        ...localFilter,
        paymentStatus: 'FIADO' as any,
      },
      select: {
        id: true,
        code: true,
        totalAmount: true,
        saleDate: true,
        dueDate: true,
        payments: { select: { amount: true } },
        customer: { select: { name: true } },
        local: { select: { name: true } },
      },
      orderBy: { saleDate: 'desc' },
    });

    // Saldo por venta = total menos abonos; solo cuentan las que aún deben.
    const fiadoWithSaldo = fiadoSales
      .map((s) => {
        const paid = (s.payments || []).reduce((p, x) => p + Number(x.amount), 0);
        return { ...s, saldo: Math.max(0, Number(s.totalAmount) - paid) };
      })
      .filter((s) => s.saldo > 0.01);

    const receivables = {
      total: Math.round(fiadoWithSaldo.reduce((a, s) => a + s.saldo, 0)),
      count: fiadoWithSaldo.length,
      items: fiadoWithSaldo.map((s) => ({
        id: s.id,
        code: s.code,
        customer: s.customer?.name || 'Consumidor final',
        amount: Math.round(s.saldo),
        date: s.saleDate,
        local: s.local?.name || '—',
      })),
    };

    return {
      success: true,
      data: {
        range: { startDate: startStr, endDate: endStr },
        summary: {
          totalSales: Math.round(totalSales),
          salesCount,
          avgTicket: Math.round(avgTicket),
          totalExpenses: Math.round(totalExpenses),
          profit: Math.round(profit),
          costOfGoods: Math.round(costOfGoods),
          grossMargin: Math.round(grossMargin),
          grossMarginPct: Math.round(grossMarginPct),
          newCustomers,
          itemsSold,
          deltas: {
            totalSales: pct(totalSales, prevTotalSales),
            salesCount: pct(salesCount, prevSalesCount),
            avgTicket: pct(avgTicket, prevAvgTicket),
            totalExpenses: pct(totalExpenses, prevTotalExpenses),
            profit: pct(profit, prevProfit),
            newCustomers: pct(newCustomers, prevNewCustomers),
          },
        },
        series,
        paymentMethods: pairs(paymentMap, 'method'),
        byLocal: pairs(localMap, 'local'),
        topProducts: topFrom(productMap, 8),
        topServices: topFrom(serviceMap, 8),
        topSellers: pairs(sellerMap, 'name').slice(0, 6),
        topCustomers,
        productProfit,
        expensesByType: pairs(expenseTypeMap, 'type'),
        expensesDetail,
        receivables,
        hasMultipleLocals: locals.length > 1,
      },
    };
  }

  // Reporte de IVA de un periodo: IVA generado (ventas) vs IVA descontable
  // (compras) → neto a pagar o saldo a favor. Base de la declaración de IVA.
  async getTaxReport(user: any, dto: any) {
    const companyId = user.companyId;
    const today = colombiaDay(new Date());
    const endStr: string = dto?.endDate || today;
    // Por defecto, desde el primer día del mes de la fecha final.
    const startStr: string = dto?.startDate || `${endStr.slice(0, 7)}-01`;
    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);
    const start = dayStartUtc(sy, sm, sd);
    const end = dayStartUtc(ey, em, ed + 1);

    const accessible = await getAccessibleLocalIds(this.prisma, user);
    const localFilter: any = accessible ? { localId: { in: accessible } } : {};
    const r2 = (n: number) => Math.round(n * 100) / 100;

    // IVA generado (ventas)
    const sales = await this.prisma.sale.findMany({
      where: {
        local: { companyId },
        ...localFilter,
        saleStatus: { notIn: ['CANCELADA', 'RECHAZADA', 'DEVUELTA'] as any },
        saleDate: { gte: start, lt: end },
      },
      select: { subtotal: true, taxTotal: true, totalAmount: true },
    });
    let baseVentas = 0;
    let ivaGenerado = 0;
    let totalVentas = 0;
    for (const s of sales) {
      baseVentas += Number(s.subtotal ?? s.totalAmount) || 0;
      ivaGenerado += Number(s.taxTotal) || 0;
      totalVentas += Number(s.totalAmount) || 0;
    }

    // IVA descontable (compras)
    const purchases = await this.prisma.purchase.findMany({
      where: {
        companyId,
        ...localFilter,
        status: { not: 'CANCELADA' as any },
        createdAt: { gte: start, lt: end },
      },
      select: { subtotal: true, taxTotal: true, total: true },
    });
    let baseCompras = 0;
    let ivaDescontable = 0;
    let totalCompras = 0;
    for (const p of purchases) {
      baseCompras += Number(p.subtotal ?? 0) || 0;
      ivaDescontable += Number(p.taxTotal) || 0;
      totalCompras += Number(p.total) || 0;
    }

    const neto = r2(ivaGenerado - ivaDescontable);
    return {
      success: true,
      data: {
        range: { startDate: startStr, endDate: endStr },
        ventas: {
          base: r2(baseVentas),
          iva: r2(ivaGenerado),
          total: r2(totalVentas),
          count: sales.length,
        },
        compras: {
          base: r2(baseCompras),
          iva: r2(ivaDescontable),
          total: r2(totalCompras),
          count: purchases.length,
        },
        iva: {
          generado: r2(ivaGenerado),
          descontable: r2(ivaDescontable),
          neto,
          aPagar: neto > 0 ? neto : 0,
          aFavor: neto < 0 ? r2(-neto) : 0,
        },
      },
    };
  }
}
