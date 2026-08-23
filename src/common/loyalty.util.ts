// Fidelización por visitas con dos escalones de descuento y ventana de días.
// Ej. barbería: visita 4 -> 50%, visita 8 -> 100% (reinicia); si pasan más de
// N días entre visita y visita, la racha se reinicia.

export interface LoyaltyConfig {
  loyaltyEnabled?: boolean;
  loyaltyTier1Visits: number;
  loyaltyTier1Percent: number;
  loyaltyTier2Visits: number;
  loyaltyTier2Percent: number;
  loyaltyMaxDays: number;
}

export function discountForVisit(cfg: LoyaltyConfig, visit: number): number {
  if (visit === cfg.loyaltyTier2Visits) return cfg.loyaltyTier2Percent;
  if (visit === cfg.loyaltyTier1Visits) return cfg.loyaltyTier1Percent;
  return 0;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / 86400000);
}

// ¿La racha sigue viva? (última visita dentro del máximo de días permitido)
export function streakActive(
  cfg: LoyaltyConfig,
  lastVisit: Date | null,
  now: Date,
): boolean {
  if (!lastVisit) return true;
  return daysBetween(now, lastVisit) <= cfg.loyaltyMaxDays;
}

// Estado para MOSTRAR (antes de facturar): próxima visita y su descuento.
export function loyaltyStatus(cfg: LoyaltyConfig, customer: any, now: Date) {
  if (!cfg?.loyaltyEnabled) return null;
  // El Consumidor Final no acumula fidelización: no debe mostrar preview.
  if (customer?.document === '222222222222') return null;
  const lastVisit = customer?.loyaltyLastVisit
    ? new Date(customer.loyaltyLastVisit)
    : null;
  const daysSince = lastVisit ? daysBetween(now, lastVisit) : null;
  const tier1 = {
    visits: cfg.loyaltyTier1Visits,
    percent: cfg.loyaltyTier1Percent,
  };
  const tier2 = {
    visits: cfg.loyaltyTier2Visits,
    percent: cfg.loyaltyTier2Percent,
  };

  // Cliente graduado: ya completó el rango; la fidelización está desactivada
  // (es cliente antiguo y paga normal). Sin descuento y sin próximas visitas.
  if (customer?.loyaltyCompleted) {
    return {
      enabled: true,
      completed: true,
      currentCount: customer?.loyaltyStamps || 0,
      nextVisit: null,
      nextDiscount: 0,
      tier1,
      tier2,
      maxDays: cfg.loyaltyMaxDays,
      lastVisit,
      daysSinceLastVisit: daysSince,
      expired: false,
    };
  }

  const active = streakActive(cfg, lastVisit, now);
  const currentCount = active ? customer?.loyaltyStamps || 0 : 0;
  const nextVisit = currentCount + 1;
  const nextDiscount = discountForVisit(cfg, nextVisit);
  return {
    enabled: true,
    completed: false,
    currentCount,
    nextVisit,
    nextDiscount,
    tier1,
    tier2,
    maxDays: cfg.loyaltyMaxDays,
    lastVisit,
    daysSinceLastVisit: daysSince,
    expired: !!lastVisit && !active,
  };
}

// Reproduce el historial de UN cliente desde sus ventas (ordenadas por fecha)
// y devuelve el estado final de sellos. Es la ÚNICA fuente de verdad: se usa al
// facturar, al anular y al sincronizar, para que todos den el mismo resultado.
export function replayCustomerStamps(
  cfg: LoyaltyConfig,
  salesAsc: { saleDate: Date | string }[],
): { stamps: number; last: Date | null; completed: boolean } {
  let stamps = 0;
  let last: Date | null = null;
  let completed = false;
  for (const s of salesAsc) {
    const when = new Date(s.saleDate);
    if (completed) {
      // Ya graduado: la fidelización quedó off, no acumula más.
      last = when;
      continue;
    }
    const r = applyLoyaltyVisit(
      cfg,
      { loyaltyStamps: stamps, loyaltyLastVisit: last, loyaltyCompleted: false },
      when,
    );
    stamps = r.newCount;
    last = when;
    if (r.completed) completed = true;
  }
  return { stamps, last, completed };
}

// Aplica una visita al facturar: contador, descuento obtenido y si con esta
// visita el cliente COMPLETA el rango (llega al tope) → se gradúa y ya no
// vuelve a acumular (la fidelización es solo para los primeros cortes).
export function applyLoyaltyVisit(cfg: LoyaltyConfig, customer: any, now: Date) {
  // Cliente ya graduado: no acumula ni recibe descuento.
  if (customer?.loyaltyCompleted) {
    const c = customer?.loyaltyStamps || 0;
    return { visit: c, discount: 0, newCount: c, completed: true };
  }
  const lastVisit = customer?.loyaltyLastVisit
    ? new Date(customer.loyaltyLastVisit)
    : null;
  const active = streakActive(cfg, lastVisit, now);
  const base = active ? customer?.loyaltyStamps || 0 : 0;
  const visit = base + 1;
  const discount = discountForVisit(cfg, visit);
  // Ya NO se reinicia el ciclo: al llegar al tope (tier2) queda completado.
  const completed = visit >= cfg.loyaltyTier2Visits;
  return { visit, discount, newCount: visit, completed };
}
