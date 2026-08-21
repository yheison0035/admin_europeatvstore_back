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
    const winbackCount = grouped.filter(
      (g) =>
        g.customerId != null &&
        !cfIds.has(g.customerId) &&
        g._max.saleDate &&
        g._max.saleDate <= cutoff,
    ).length;

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
        nextAppointments,
      },
    };
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
        select: { amount: true, type: true, expenseDate: true },
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
    const productMap: Record<string, { quantity: number; total: number }> = {};
    const serviceMap: Record<string, { quantity: number; total: number }> = {};

    let costOfGoods = 0; // costo de la mercancía vendida (solo productos)
    for (const sale of sales) {
      totalSales += sale.totalAmount;
      const day = colombiaDay(sale.saleDate);
      salesByDay[day] = (salesByDay[day] || 0) + sale.totalAmount;
      paymentMap[sale.paymentMethod] =
        (paymentMap[sale.paymentMethod] || 0) + sale.totalAmount;
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
          if (!productMap[n]) productMap[n] = { quantity: 0, total: 0 };
          productMap[n].quantity += item.quantity;
          productMap[n].total += item.subtotal;
          costOfGoods +=
            item.quantity * (item.variant.inventory.purchasePrice || 0);
        }
      }
    }

    // Gastos por tipo y por día
    const expenseTypeMap: Record<string, number> = {};
    const expensesByDay: Record<string, number> = {};
    let totalExpenses = 0;
    for (const e of expenses) {
      totalExpenses += e.amount;
      expenseTypeMap[e.type] = (expenseTypeMap[e.type] || 0) + e.amount;
      const day = utcDay(e.expenseDate);
      expensesByDay[day] = (expensesByDay[day] || 0) + e.amount;
    }

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
        expensesByType: pairs(expenseTypeMap, 'type'),
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
