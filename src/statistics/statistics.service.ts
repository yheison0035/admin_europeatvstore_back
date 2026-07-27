import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

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
  constructor(private prisma: PrismaService) {}

  async getDashboard(user: any, dto: any) {
    const companyId = user.companyId;
    const localId = dto.localId ? Number(dto.localId) : null;

    // ---- Rango de fechas (Colombia) ----
    const today = colombiaDay(new Date());
    const endStr: string = dto.endDate || today;
    const startStr: string =
      dto.startDate ||
      colombiaDay(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));

    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);

    const start = dayStartUtc(sy, sm, sd);
    const end = dayStartUtc(ey, em, ed + 1); // exclusivo (día siguiente 00:00 Col)

    const lengthMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - lengthMs);
    const prevEnd = start;

    // Gastos: fecha "solo día" (medianoche UTC) → límites y agrupación en UTC.
    const expStart = new Date(Date.UTC(sy, sm - 1, sd, 0, 0, 0));
    const expEnd = new Date(Date.UTC(ey, em - 1, ed + 1, 0, 0, 0));
    const expLen = expEnd.getTime() - expStart.getTime();
    const prevExpStart = new Date(expStart.getTime() - expLen);
    const prevExpEnd = expStart;

    const localFilter = localId ? { localId } : {};

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
              variant: { include: { inventory: { select: { name: true } } } },
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
        customer: { select: { name: true } },
        local: { select: { name: true } },
      },
      orderBy: { saleDate: 'desc' },
    });

    const receivables = {
      total: Math.round(fiadoSales.reduce((a, s) => a + s.totalAmount, 0)),
      count: fiadoSales.length,
      items: fiadoSales.map((s) => ({
        id: s.id,
        code: s.code,
        customer: s.customer?.name || 'Consumidor final',
        amount: Math.round(s.totalAmount),
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
}
