import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '@/prisma.service';
import { MailService } from '@/mail/mail.service';

const ADMIN_ROLES: Role[] = [Role.SUPER_ADMIN, Role.ADMIN];

// Tipo de documento del cliente -> catálogo DIAN (identification_document).
const DOC_TYPE_MAP: Record<string, string> = {
  RC: '11',
  TI: '12',
  CC: '13',
  CE: '22',
  NIT: '31',
  PP: '41',
};

/**
 * Puente entre el CRM y la Pegazo Fiscal API (integración directa DIAN).
 * La API key vive solo aquí (backend), nunca llega al navegador.
 */
@Injectable()
export class FiscalService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  private get baseUrl() {
    return (
      process.env.FISCAL_API_URL ||
      'https://pegazo-fiscal-api-production.up.railway.app'
    ).replace(/\/$/, '');
  }

  private assertAdmin(user: any) {
    if (!ADMIN_ROLES.includes(user.role))
      throw new ForbiddenException('No tienes permisos');
  }

  /** Llama a la Fiscal API. Devuelve el JSON o lanza con el mensaje del servicio. */
  private async fapi(path: string, init: RequestInit = {}): Promise<any> {
    const key = process.env.FISCAL_API_KEY;
    if (!key)
      throw new BadRequestException(
        'La integración fiscal no está configurada (falta FISCAL_API_KEY).',
      );
    const res = await fetch(`${this.baseUrl}/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      let msg = `Fiscal API ${res.status}`;
      try {
        const j = await res.json();
        msg = j.message || msg;
      } catch {
        /* noop */
      }
      throw new BadRequestException(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  private async company(user: any) {
    const c = await this.prisma.company.findUnique({
      where: { id: user.companyId },
    });
    if (!c) throw new NotFoundException('Empresa no encontrada');
    return c;
  }

  /** Estado de la integración + estadísticas para el tablero. */
  async status(user: any) {
    this.assertAdmin(user);
    const c = await this.company(user);
    const base = {
      enabled: c.electronicInvoicingEnabled,
      linked: !!c.fiscalCompanyId,
      nit: c.nit,
      hasNit: !!c.nit,
    };
    if (!c.fiscalCompanyId) return { success: true, data: base };

    const [detail, stats] = await Promise.all([
      this.fapi(`/companies/${c.fiscalCompanyId}`).catch(() => null),
      this.fapi(`/documents/stats?companyId=${c.fiscalCompanyId}`).catch(
        () => null,
      ),
    ]);
    return {
      success: true,
      data: {
        ...base,
        env: detail?.env || 'HABILITACION',
        habilitacion: detail?.habilitacion || 'REGISTRADO',
        hasCertificate: !!detail?.certExpiresAt,
        certExpiresAt: detail?.certExpiresAt || null,
        resolutions: detail?.resolutions || [],
        stats: stats || null,
      },
    };
  }

  /** Vincula la empresa del CRM con una empresa en la Fiscal API. */
  async setup(user: any) {
    this.assertAdmin(user);
    const c = await this.company(user);
    if (c.fiscalCompanyId)
      return { success: true, data: { fiscalCompanyId: c.fiscalCompanyId } };
    if (!c.nit)
      throw new BadRequestException(
        'La empresa no tiene NIT. Configúralo antes de activar la facturación.',
      );

    const created = await this.fapi('/companies', {
      method: 'POST',
      body: JSON.stringify({
        nit: c.nit,
        dv: c.dv || undefined,
        legalName: c.businessName || c.name,
        tradeName: c.name,
        externalId: String(c.id),
      }),
    });
    await this.prisma.company.update({
      where: { id: c.id },
      data: { fiscalCompanyId: created.id },
    });
    return { success: true, data: { fiscalCompanyId: created.id } };
  }

  /** Registra una resolución de numeración en la Fiscal API. */
  async addResolution(user: any, dto: any) {
    this.assertAdmin(user);
    const c = await this.company(user);
    if (!c.fiscalCompanyId)
      throw new BadRequestException('La empresa no está vinculada al servicio fiscal.');
    return this.fapi(`/companies/${c.fiscalCompanyId}/resolutions`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /** Listado de documentos (con filtros/paginación) para el tablero. */
  async listDocuments(user: any, query: any) {
    this.assertAdmin(user);
    const c = await this.company(user);
    if (!c.fiscalCompanyId) return { data: [], meta: { page: 1, totalPages: 1, total: 0 } };
    const params = new URLSearchParams();
    params.set('companyId', c.fiscalCompanyId);
    for (const k of [
      'type',
      'status',
      'search',
      'dateFrom',
      'dateTo',
      'page',
      'limit',
    ]) {
      if (query[k] != null && query[k] !== '') params.set(k, String(query[k]));
    }
    return this.fapi(`/documents?${params.toString()}`);
  }

  async stats(user: any) {
    this.assertAdmin(user);
    const c = await this.company(user);
    if (!c.fiscalCompanyId) return null;
    return this.fapi(`/documents/stats?companyId=${c.fiscalCompanyId}`);
  }

  /** Emite una factura electrónica a partir de una venta del CRM. */
  async emitForSale(user: any, saleId: number) {
    this.assertAdmin(user);
    const c = await this.company(user);
    if (!c.fiscalCompanyId)
      throw new BadRequestException('La empresa no está vinculada al servicio fiscal.');

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

    const cust: any = sale.customer;
    const docType = (cust?.type_document || 'CC').toUpperCase();
    const customer = {
      name: cust?.name || 'Consumidor Final',
      identification: cust?.document || '222222222222',
      idType: DOC_TYPE_MAP[docType] || '13',
      email: cust?.email || undefined,
      phone: cust?.phone || undefined,
      address: cust?.address || undefined,
    };
    const lines = (sale.items || []).map((it: any) => ({
      description: it.service?.name || it.variant?.inventory?.name || 'Ítem',
      code: String(it.id),
      quantity: it.quantity,
      unitPrice: it.price,
      vatRate: Number(it.taxRate ?? 0),
    }));

    return this.fapi('/invoices', {
      method: 'POST',
      body: JSON.stringify({
        companyId: c.fiscalCompanyId,
        idempotencyKey: `sale-${saleId}`,
        customer,
        lines,
      }),
    });
  }

  /** Emite una factura de PRUEBA (datos de ejemplo) para validar el flujo. */
  async emitTest(user: any) {
    this.assertAdmin(user);
    const c = await this.company(user);
    if (!c.fiscalCompanyId)
      throw new BadRequestException('La empresa no está vinculada al servicio fiscal.');
    return this.fapi('/invoices', {
      method: 'POST',
      body: JSON.stringify({
        companyId: c.fiscalCompanyId,
        idempotencyKey: `test-${Date.now()}`,
        customer: {
          name: 'Cliente de Prueba',
          identification: '222222222222',
          idType: '13',
        },
        lines: [
          {
            description: 'Producto/servicio de prueba',
            quantity: 1,
            unitPrice: 50000,
            vatRate: 19,
          },
        ],
      }),
    });
  }

  async getDocument(user: any, id: string) {
    this.assertAdmin(user);
    await this.company(user);
    return this.fapi(`/invoices/${id}`);
  }

  /** Envía la factura electrónica al correo del cliente. */
  async sendEmail(user: any, id: string) {
    this.assertAdmin(user);
    const c = await this.company(user);
    const doc = await this.fapi(`/invoices/${id}`);
    if (!doc?.customerEmail)
      throw new BadRequestException('El cliente no tiene correo registrado.');
    const html = await this.representation(user, id);
    const companyName = c.businessName || c.name;
    // Se envía por el correo central (Resend/Brevo) con el nombre de la empresa.
    const res = await this.mail.sendInvoiceEmail({
      to: doc.customerEmail,
      subject: `Factura electrónica ${doc.number || ''} · ${companyName}`,
      html,
      companyName,
    });
    return { success: true, ...res, to: doc.customerEmail };
  }

  /** Devuelve el enlace de WhatsApp para enviar la factura al cliente. */
  async whatsappLink(user: any, id: string) {
    this.assertAdmin(user);
    await this.company(user);
    const doc = await this.fapi(`/invoices/${id}`);
    const raw = String(doc?.customerPhone || '').replace(/\D/g, '');
    if (!raw)
      throw new BadRequestException('El cliente no tiene teléfono registrado.');
    // Normaliza a Colombia: 57 + 10 dígitos que empiezan en 3.
    let phone = raw;
    if (phone.length === 10 && phone.startsWith('3')) phone = `57${phone}`;
    const link = doc.cufe
      ? `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${doc.cufe}`
      : '';
    const msg =
      `Hola, te compartimos tu *Factura electrónica* ${doc.number || ''}.` +
      (link ? `\nConsúltala en la DIAN: ${link}` : '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    return { success: true, url };
  }

  /** Representación gráfica (HTML) de un documento. */
  async representation(user: any, id: string): Promise<string> {
    this.assertAdmin(user);
    await this.company(user);
    const key = process.env.FISCAL_API_KEY;
    const res = await fetch(`${this.baseUrl}/v1/invoices/${id}/representation`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new BadRequestException('No se pudo obtener la representación.');
    return res.text();
  }
}
