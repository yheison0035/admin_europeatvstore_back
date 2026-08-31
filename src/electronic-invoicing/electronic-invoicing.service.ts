import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '@/prisma.service';

// Solo el dueño/administrador configura y emite.
const ADMIN_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN];

// Mapa de tipo de documento del cliente -> catálogo Factus (identification_document_id).
const DOC_TYPE_MAP: Record<string, string> = {
  CC: '3', // Cédula de ciudadanía
  CE: '5', // Cédula de extranjería
  NIT: '6', // NIT
  PP: '7', // Pasaporte
  TI: '2', // Tarjeta de identidad
  RC: '1', // Registro civil
};

@Injectable()
export class ElectronicInvoicingService {
  constructor(private prisma: PrismaService) {}

  private assertAdmin(user: any) {
    if (!ADMIN_ROLES.includes(user.role)) {
      throw new ForbiddenException('No tienes permisos');
    }
  }

  private baseUrl(config: { environment: string }) {
    return config.environment === 'PRODUCTION'
      ? 'https://api.factus.com.co'
      : 'https://api-sandbox.factus.com.co';
  }

  // ---- Configuración ----

  // Devuelve la config SIN exponer los secretos (solo si están puestos).
  async getConfig(user: any) {
    this.assertAdmin(user);
    const c = await this.prisma.factusConfig.findUnique({
      where: { companyId: user.companyId },
    });
    if (!c) {
      return {
        success: true,
        data: {
          enabled: false,
          environment: 'SANDBOX',
          hasClientId: false,
          hasClientSecret: false,
          hasUsername: false,
          hasPassword: false,
          numberingRangeId: null,
          paymentMethodCode: '10',
          legalOrganizationId: '2',
          tributeId: '21',
          municipalityId: null,
          unitMeasureId: '70',
          testedAt: null,
        },
      };
    }
    return {
      success: true,
      data: {
        enabled: c.enabled,
        environment: c.environment,
        hasClientId: !!c.clientId,
        hasClientSecret: !!c.clientSecret,
        hasUsername: !!c.username,
        hasPassword: !!c.password,
        username: c.username, // el usuario/email no es secreto
        numberingRangeId: c.numberingRangeId,
        paymentMethodCode: c.paymentMethodCode,
        legalOrganizationId: c.legalOrganizationId,
        tributeId: c.tributeId,
        municipalityId: c.municipalityId,
        unitMeasureId: c.unitMeasureId,
        testedAt: c.testedAt,
      },
    };
  }

  // Guarda la config. Los secretos solo se sobrescriben si llegan con valor
  // (para no borrarlos al editar otros campos).
  async saveConfig(user: any, dto: any) {
    this.assertAdmin(user);
    const only = (v: any) =>
      v !== undefined && v !== null && String(v).length > 0 ? v : undefined;

    const data: any = {
      enabled: dto.enabled ?? undefined,
      environment: dto.environment ?? undefined,
      clientId: only(dto.clientId),
      clientSecret: only(dto.clientSecret),
      username: only(dto.username),
      password: only(dto.password),
      numberingRangeId:
        dto.numberingRangeId !== undefined
          ? dto.numberingRangeId
            ? Number(dto.numberingRangeId)
            : null
          : undefined,
      paymentMethodCode: dto.paymentMethodCode ?? undefined,
      legalOrganizationId: dto.legalOrganizationId ?? undefined,
      tributeId: dto.tributeId ?? undefined,
      municipalityId: dto.municipalityId ?? undefined,
      unitMeasureId: dto.unitMeasureId ?? undefined,
    };
    // Si cambian credenciales, invalida el token guardado.
    if (data.clientId || data.clientSecret || data.username || data.password) {
      data.accessToken = null;
      data.refreshToken = null;
      data.tokenExpiresAt = null;
    }

    await this.prisma.factusConfig.upsert({
      where: { companyId: user.companyId },
      create: { companyId: user.companyId, ...data },
      update: data,
    });
    return this.getConfig(user);
  }

  private async loadConfigOrThrow(companyId: number) {
    const c = await this.prisma.factusConfig.findUnique({
      where: { companyId },
    });
    if (!c || !c.clientId || !c.clientSecret || !c.username || !c.password) {
      throw new BadRequestException(
        'Falta configurar las credenciales de Factus.',
      );
    }
    return c;
  }

  // ---- Token OAuth2 (password grant + refresh) ----

  private async getToken(config: any): Promise<string> {
    const now = Date.now();
    if (config.accessToken && config.tokenExpiresAt) {
      const exp = new Date(config.tokenExpiresAt).getTime();
      if (exp - now > 30_000) return config.accessToken;
      // Intenta refrescar.
      if (config.refreshToken) {
        const refreshed = await this.requestToken(config, {
          grant_type: 'refresh_token',
          refresh_token: config.refreshToken,
        });
        if (refreshed) return refreshed;
      }
    }
    const token = await this.requestToken(config, {
      grant_type: 'password',
      username: config.username,
      password: config.password,
    });
    if (!token) throw new BadRequestException('No se pudo autenticar en Factus.');
    return token;
  }

  private async requestToken(config: any, grant: any): Promise<string | null> {
    const res = await fetch(`${this.baseUrl(config)}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        ...grant,
      }),
    });
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    const access = json?.access_token;
    if (!access) return null;
    const expiresAt = new Date(
      Date.now() + (Number(json.expires_in) || 3600) * 1000,
    );
    await this.prisma.factusConfig.update({
      where: { companyId: config.companyId },
      data: {
        accessToken: access,
        refreshToken: json.refresh_token ?? config.refreshToken,
        tokenExpiresAt: expiresAt,
      },
    });
    // Refleja en el objeto en memoria.
    config.accessToken = access;
    config.tokenExpiresAt = expiresAt;
    if (json.refresh_token) config.refreshToken = json.refresh_token;
    return access;
  }

  private async api(config: any, method: string, path: string, body?: any) {
    const token = await this.getToken(config);
    const doFetch = (t: string) =>
      fetch(`${this.baseUrl(config)}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${t}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    let res = await doFetch(token);
    if (res.status === 401) {
      // Token vencido: fuerza uno nuevo y reintenta una vez.
      config.tokenExpiresAt = null;
      const fresh = await this.getToken(config);
      res = await doFetch(fresh);
    }
    const json: any = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  }

  // ---- Acciones ----

  async testConnection(user: any) {
    this.assertAdmin(user);
    const config = await this.loadConfigOrThrow(user.companyId);
    try {
      await this.getToken(config);
      await this.prisma.factusConfig.update({
        where: { companyId: user.companyId },
        data: { testedAt: new Date() },
      });
      return { success: true, message: 'Conexión con Factus exitosa.' };
    } catch (e: any) {
      throw new BadRequestException(
        e?.message || 'No se pudo conectar con Factus.',
      );
    }
  }

  // Rangos de numeración autorizados (para elegir en la configuración).
  async numberingRanges(user: any) {
    this.assertAdmin(user);
    const config = await this.loadConfigOrThrow(user.companyId);
    const { ok, json } = await this.api(
      config,
      'GET',
      '/v1/numbering-ranges',
    );
    if (!ok) {
      throw new BadRequestException('No se pudieron obtener los rangos.');
    }
    const list = json?.data || json || [];
    return { success: true, data: list };
  }

  // Emite la factura electrónica de una venta.
  async emitForSale(user: any, saleId: number) {
    this.assertAdmin(user);
    const config = await this.loadConfigOrThrow(user.companyId);
    if (!config.numberingRangeId) {
      throw new BadRequestException(
        'Falta seleccionar el rango de numeración en la configuración.',
      );
    }

    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, local: { companyId: user.companyId } },
      include: {
        customer: true,
        items: {
          include: {
            service: { select: { name: true } },
            variant: { include: { inventory: { select: { name: true } } } },
          },
        },
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');

    // Evita duplicados: si ya está emitida, la devuelve.
    const existing = await this.prisma.electronicInvoice.findUnique({
      where: { saleId },
    });
    if (existing && existing.status === 'EMITIDA') {
      return { success: true, data: existing, alreadyEmitted: true };
    }

    const payload = this.buildPayload(config, sale);
    const { ok, json } = await this.api(
      config,
      'POST',
      '/v1/bills/validate',
      payload,
    );

    // Extrae campos de la respuesta de forma defensiva (la estructura puede
    // variar según versión de la API).
    const bill = json?.data?.bill || json?.data || json || {};
    const number =
      bill?.number || bill?.name || json?.data?.number || null;
    const cufe = bill?.cufe || json?.data?.cufe || null;
    const qrUrl = bill?.qr || bill?.qr_image || json?.data?.qr || null;
    const pdfUrl =
      bill?.public_url ||
      json?.data?.public_url ||
      (number ? `${this.baseUrl(config)}/v1/bills/download-pdf/${number}` : null);
    const xmlUrl =
      bill?.xml_url ||
      (number ? `${this.baseUrl(config)}/v1/bills/download-xml/${number}` : null);

    const record = {
      companyId: user.companyId,
      saleId,
      provider: 'FACTUS',
      number: number ? String(number) : null,
      cufe: cufe ? String(cufe) : null,
      status: ok && cufe ? 'EMITIDA' : 'ERROR',
      qrUrl,
      pdfUrl,
      xmlUrl,
      validatedAt: ok && cufe ? new Date() : null,
      error: ok
        ? null
        : json?.message ||
          JSON.stringify(json?.errors || json || {}).slice(0, 800),
      raw: json ?? undefined,
    };

    const saved = await this.prisma.electronicInvoice.upsert({
      where: { saleId },
      create: record,
      update: record,
    });

    if (!ok || !cufe) {
      throw new BadRequestException({
        message: 'La DIAN/Factus rechazó la factura.',
        detail: record.error,
        data: saved,
      });
    }
    return { success: true, data: saved };
  }

  async getForSale(user: any, saleId: number) {
    this.assertAdmin(user);
    const inv = await this.prisma.electronicInvoice.findUnique({
      where: { saleId },
    });
    return { success: true, data: inv };
  }

  // ---- Armado del payload Factus ----
  private buildPayload(config: any, sale: any) {
    const cust = sale.customer;
    const docType = (cust?.type_document || 'CC').toUpperCase();
    const identification = cust?.document || '222222222222';
    const isFinal =
      !cust?.document || cust.document === '222222222222';

    const customer = {
      identification,
      dv: undefined as string | undefined,
      company: '',
      trade_name: '',
      names: cust?.name || 'Consumidor Final',
      address: cust?.address || 'N/A',
      email: cust?.email || '',
      phone: cust?.phone || '',
      legal_organization_id: config.legalOrganizationId || '2',
      tribute_id: config.tributeId || '21',
      identification_document_id: DOC_TYPE_MAP[docType] || '3',
      municipality_id: config.municipalityId || undefined,
    };

    const items = (sale.items || []).map((it: any) => {
      const name =
        it.service?.name || it.variant?.inventory?.name || 'Ítem';
      const taxRate = Number(it.taxRate ?? 0);
      return {
        code_reference: String(it.id),
        name,
        quantity: it.quantity,
        discount_rate: 0,
        price: it.price,
        tax_rate: taxRate.toFixed(2),
        unit_measure_id: Number(config.unitMeasureId || 70),
        standard_code_id: 1,
        is_excluded: taxRate > 0 ? 0 : 1,
        tribute_id: 1, // IVA
        withholding_taxes: [],
      };
    });

    return {
      numbering_range_id: config.numberingRangeId,
      reference_code: sale.code,
      observation: '',
      payment_method_code: config.paymentMethodCode || '10',
      customer,
      items,
    };
  }
}
