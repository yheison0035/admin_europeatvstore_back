import { PrismaService } from '@/prisma.service';

/**
 * Origenes permitidos en CORS.
 *
 * La plataforma es multi-tenant y cada empresa publica su tienda en SU PROPIO
 * dominio, así que la lista de orígenes no puede ser fija: se arma con los
 * dominios de las empresas que tienen el sitio web activo (Company.domain +
 * websiteEnabled) y se refresca cada cierto tiempo para que un dominio nuevo
 * quede habilitado sin redesplegar.
 */

const CACHE_TTL_MS = 60_000;

/** Convierte un dominio guardado en BD en los orígenes que puede enviar el navegador. */
export function originsForDomain(rawDomain: string | null): string[] {
  const domain = (rawDomain || '')
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .split(':')[0]
    .replace(/^www\./, '')
    .trim()
    .toLowerCase();

  if (!domain) return [];

  return [
    `https://${domain}`,
    `https://www.${domain}`,
    `http://${domain}`,
    `http://www.${domain}`,
  ];
}

export function createCorsOriginChecker(
  prisma: PrismaService,
  options: { staticOrigins: string[]; allowLocalhost: boolean },
) {
  const staticOrigins = new Set(options.staticOrigins);

  let tenantOrigins = new Set<string>();
  let loadedAt = 0;
  let inFlight: Promise<void> | null = null;

  const refresh = async () => {
    const companies = await prisma.company.findMany({
      where: { websiteEnabled: true, NOT: { domain: null } },
      select: { domain: true },
    });

    const origins = new Set<string>();

    companies.forEach((company) => {
      originsForDomain(company.domain).forEach((origin) => origins.add(origin));
    });

    tenantOrigins = origins;
    loadedAt = Date.now();
  };

  const ensureFresh = async () => {
    if (Date.now() - loadedAt <= CACHE_TTL_MS) return;

    // Evita que varias peticiones simultáneas disparen la misma consulta.
    inFlight =
      inFlight ??
      refresh()
        .catch((error) => {
          // Si la BD falla no dejamos la caché "recién cargada": se reintenta pronto.
          loadedAt = Date.now() - CACHE_TTL_MS + 5_000;
          console.error('CORS: no se pudieron cargar los dominios', error);
        })
        .finally(() => {
          inFlight = null;
        });

    await inFlight;
  };

  return async (origin: string): Promise<boolean> => {
    if (staticOrigins.has(origin)) return true;

    if (
      options.allowLocalhost &&
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    ) {
      return true;
    }

    await ensureFresh();

    return tenantOrigins.has(origin);
  };
}
