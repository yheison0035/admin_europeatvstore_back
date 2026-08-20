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
  const lastVisit = customer?.loyaltyLastVisit
    ? new Date(customer.loyaltyLastVisit)
    : null;
  const active = streakActive(cfg, lastVisit, now);
  const currentCount = active ? customer?.loyaltyStamps || 0 : 0;
  const nextVisit = currentCount + 1;
  const nextDiscount = discountForVisit(cfg, nextVisit);
  const daysSince = lastVisit ? daysBetween(now, lastVisit) : null;
  return {
    enabled: true,
    currentCount,
    nextVisit,
    nextDiscount,
    tier1: { visits: cfg.loyaltyTier1Visits, percent: cfg.loyaltyTier1Percent },
    tier2: { visits: cfg.loyaltyTier2Visits, percent: cfg.loyaltyTier2Percent },
    maxDays: cfg.loyaltyMaxDays,
    lastVisit,
    daysSinceLastVisit: daysSince,
    expired: !!lastVisit && !active,
  };
}

// Aplica una visita al facturar: nuevo contador + descuento obtenido.
export function applyLoyaltyVisit(cfg: LoyaltyConfig, customer: any, now: Date) {
  const lastVisit = customer?.loyaltyLastVisit
    ? new Date(customer.loyaltyLastVisit)
    : null;
  const active = streakActive(cfg, lastVisit, now);
  const base = active ? customer?.loyaltyStamps || 0 : 0;
  const visit = base + 1;
  const discount = discountForVisit(cfg, visit);
  const newCount = visit >= cfg.loyaltyTier2Visits ? 0 : visit;
  return { visit, discount, newCount };
}
