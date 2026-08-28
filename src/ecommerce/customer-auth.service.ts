import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/prisma.service';
import { MailService } from '@/mail/mail.service';
import { WebsiteService } from '@/modules/website/website.service';
import { WebsiteContext } from '@/modules/website/interfaces/website-context.interface';
import {
  LoginCustomerDto,
  RegisterCustomerDto,
  UpdateCustomerProfileDto,
} from './dto/customer-auth.dto';

// Identidad y sesión de los clientes de la tienda online. La identidad vive en
// el modelo Customer del CRM (source = ECOMMERCE), así aparecen en el módulo de
// Clientes del negocio. El token es un JWT separado del staff (kind:'customer').
@Injectable()
export class CustomerAuthService {
  private readonly log = new Logger(CustomerAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly website: WebsiteService,
  ) {}

  private normalizeEmail(email: string) {
    return (email || '').trim().toLowerCase();
  }

  private safe(customer: any) {
    if (!customer) return null;
    const { password, ...rest } = customer;
    return rest;
  }

  private async signToken(customer: {
    id: number;
    companyId: number;
    email: string | null;
  }) {
    return this.jwt.signAsync(
      {
        sub: customer.id,
        companyId: customer.companyId,
        email: customer.email,
        kind: 'customer',
      },
      { expiresIn: '30d' },
    );
  }

  // Busca un cliente por correo dentro de la empresa (case-insensitive).
  // Incluye el hash de contraseña (para login/registro); el resto de la app lo
  // tiene omitido globalmente.
  private async findByEmail(companyId: number, email: string) {
    return this.prisma.customer.findFirst({
      where: {
        companyId,
        email: { equals: email, mode: 'insensitive' },
      },
      omit: { password: false },
    });
  }

  async register(dto: RegisterCustomerDto, website: WebsiteContext) {
    const email = this.normalizeEmail(dto.email);
    const companyId = website.companyId;
    const localId = website.localId;

    const existing = await this.findByEmail(companyId, email);

    // Ya hay una cuenta con contraseña para ese correo → debe iniciar sesión.
    if (existing && existing.password) {
      throw new ConflictException(
        'Ya existe una cuenta con ese correo. Inicia sesión.',
      );
    }

    const hash = await bcrypt.hash(dto.password, 10);

    // El cliente ya existía en el CRM (sin contraseña) → reclama su cuenta.
    if (existing) {
      const updated = await this.prisma.customer.update({
        where: { id: existing.id },
        data: {
          password: hash,
          name: existing.name || dto.name.trim(),
          phone: existing.phone || dto.phone || null,
          // Se marca como cliente también de la tienda si venía solo del CRM.
          email: existing.email || email,
        },
      });
      return {
        success: true,
        data: {
          access_token: await this.signToken(updated),
          customer: this.safe(updated),
        },
      };
    }

    // Documento solo si viene y no choca con otro cliente de la empresa
    // (evita romper el unique [document, companyId]).
    let document: string | null = null;
    if (dto.documentNumber) {
      const doc = dto.documentNumber.trim();
      const clash = await this.prisma.customer.findFirst({
        where: { companyId, document: doc },
        select: { id: true },
      });
      if (!clash) document = doc;
    }

    const created = await this.prisma.customer.create({
      data: {
        name: dto.name.trim(),
        email,
        phone: dto.phone || null,
        document,
        companyId,
        localId,
        source: 'ECOMMERCE',
        password: hash,
      },
    });

    return {
      success: true,
      data: {
        access_token: await this.signToken(created),
        customer: this.safe(created),
      },
    };
  }

  async login(dto: LoginCustomerDto, website: WebsiteContext) {
    const email = this.normalizeEmail(dto.email);
    const customer = await this.findByEmail(website.companyId, email);

    if (!customer || !customer.password) {
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    const ok = await bcrypt.compare(dto.password, customer.password);
    if (!ok) {
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    return {
      success: true,
      data: {
        access_token: await this.signToken(customer),
        customer: this.safe(customer),
      },
    };
  }

  async me(customerId: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new UnauthorizedException('Cliente no encontrado.');
    }

    const orders = await this.prisma.sale.findMany({
      where: { customerId },
      orderBy: { saleDate: 'desc' },
      take: 20,
      select: {
        id: true,
        code: true,
        totalAmount: true,
        saleDate: true,
        saleStatus: true,
        paymentStatus: true,
        shippingStatus: true,
        source: true,
      },
    });

    return {
      success: true,
      data: { customer: this.safe(customer), orders },
    };
  }

  async updateProfile(customerId: number, dto: UpdateCustomerProfileDto) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.phone !== undefined) data.phone = dto.phone || null;

    // Documento: solo si no choca con otro cliente de la empresa.
    if (dto.documentNumber !== undefined) {
      const me = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { companyId: true },
      });
      const doc = (dto.documentNumber || '').trim();
      if (doc && me) {
        const clash = await this.prisma.customer.findFirst({
          where: {
            companyId: me.companyId,
            document: doc,
            id: { not: customerId },
          },
          select: { id: true },
        });
        if (!clash) data.document = doc;
      } else if (!doc) {
        data.document = null;
      }
    }

    const updated = await this.prisma.customer.update({
      where: { id: customerId },
      data,
    });
    return { success: true, data: { customer: this.safe(updated) } };
  }

  // ---- Restablecer contraseña por correo ----

  // Secreto por-cliente: incluye el hash actual de la contraseña, así el enlace
  // deja de servir en cuanto la contraseña cambia (single-use).
  private resetSecret(passwordHash: string | null) {
    return (process.env.JWT_SECRET || '') + (passwordHash || 'sin-clave');
  }

  // Envía el enlace de restablecimiento. Responde igual exista o no el correo
  // (no se revela si un correo está registrado).
  async forgotPassword(email: string, website: WebsiteContext) {
    const normalized = this.normalizeEmail(email);
    const customer = await this.findByEmail(website.companyId, normalized);

    if (customer && customer.email) {
      const token = await this.jwt.signAsync(
        { sub: customer.id, companyId: website.companyId, kind: 'customer-reset' },
        { secret: this.resetSecret(customer.password), expiresIn: '30m' },
      );
      const base = `https://${website.domain}`;
      const resetUrl = `${base}/restablecer?token=${token}`;
      const c: any = website.company || {};
      // SMTP propio de la empresa (con la contraseña, que está omitida por
      // defecto): así el correo sale DESDE el correo del negocio.
      const mail: any = await this.prisma.company.findUnique({
        where: { id: website.companyId },
        omit: { mailPassword: false },
      });
      // Envío en SEGUNDO PLANO: no se espera para no bloquear la respuesta
      // (un SMTP lento/bloqueado no debe colgar la petición).
      void this.mail
        .sendCustomerPasswordReset(
          customer.email,
          resetUrl,
          {
            companyName: c.websiteName || c.name || undefined,
            logo: c.logo || null,
            accentColor: c.ctaColor || c.primaryColor || c.accentColor || null,
            customerName: customer.name,
            supportEmail: c.mailFromEmail || c.email || null,
          },
          {
            host: mail?.mailHost,
            port: mail?.mailPort,
            user: mail?.mailUser,
            pass: mail?.mailPassword,
            fromEmail: mail?.mailFromEmail || mail?.mailUser,
            fromName:
              mail?.mailFromName || c.websiteName || c.name || undefined,
          },
        )
        .catch((e) =>
          this.log?.error?.(`Fallo enviando reset a ${customer.email}: ${e?.message}`),
        );
    }

    return {
      success: true,
      message:
        'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    // Se decodifica sin verificar para saber a qué cliente pertenece y así
    // reconstruir su secreto (que depende de su hash actual).
    let decoded: any;
    try {
      decoded = this.jwt.decode(token);
    } catch {
      decoded = null;
    }
    if (!decoded?.sub || decoded?.kind !== 'customer-reset') {
      throw new UnauthorizedException('Enlace inválido o expirado.');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: Number(decoded.sub) },
      omit: { password: false },
    });
    if (!customer) {
      throw new UnauthorizedException('Enlace inválido o expirado.');
    }

    // Verifica firma + expiración con el secreto por-cliente.
    try {
      await this.jwt.verifyAsync(token, {
        secret: this.resetSecret(customer.password),
      });
    } catch {
      throw new UnauthorizedException('El enlace expiró o ya fue usado.');
    }

    const hash = await bcrypt.hash(newPassword, 10);
    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: { password: hash },
    });

    return {
      success: true,
      message: 'Tu contraseña fue actualizada. Ya puedes iniciar sesión.',
      data: {
        access_token: await this.signToken(updated),
        customer: this.safe(updated),
      },
    };
  }

  // TEMPORAL: diagnóstico de envío de correo por la cuenta central.
  async mailDiag(to: string) {
    return this.mail.diag(to);
  }

  // ---- Inicio/registro con Google (flujo por redirección, MULTI-TENANT) ----
  //
  // No usa el botón client-side (que exige registrar cada dominio en Google).
  // Un solo callback central (el backend) sirve para CUALQUIER dominio: la
  // tienda manda a /google/start?return=<su-origen>, el usuario entra en Google,
  // Google vuelve al callback del backend, y el backend devuelve al cliente a su
  // propio dominio ya con la sesión.

  private googleClientId() {
    return (
      process.env.GOOGLE_CLIENT_ID ||
      '763872388804-5p6fncsiplu0n7iirhbg1bdvjk0dcm38.apps.googleusercontent.com'
    );
  }

  private googleRedirectUri() {
    return (
      process.env.GOOGLE_REDIRECT_URI ||
      'https://admineuropeatvstoreback-production.up.railway.app/ecommerce/auth/google/callback'
    );
  }

  private async findOrCreateEcommerceCustomer(
    email: string,
    name: string,
    companyId: number,
    localId: number,
  ) {
    let customer = await this.findByEmail(companyId, email);
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: { name, email, companyId, localId, source: 'ECOMMERCE' },
      });
    }
    return customer;
  }

  // Construye la URL de Google a la que se envía al usuario. `returnOrigin` es
  // el origen de la tienda (https://dominio) al que hay que devolverlo.
  async buildGoogleAuthUrl(returnOrigin: string) {
    if (!returnOrigin || !/^https?:\/\//.test(returnOrigin)) {
      throw new UnauthorizedException('Origen de retorno inválido.');
    }
    const state = await this.jwt.signAsync(
      { r: returnOrigin.replace(/\/+$/, ''), kind: 'goauth' },
      { expiresIn: '10m' },
    );
    const params = new URLSearchParams({
      client_id: this.googleClientId(),
      redirect_uri: this.googleRedirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
      access_type: 'online',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  // Procesa el retorno de Google. Devuelve la URL a la que redirigir el
  // navegador (siempre el dominio de la tienda que inició el flujo).
  async handleGoogleCallback(code: string, state: string): Promise<string> {
    let returnOrigin: string;
    try {
      const decoded: any = await this.jwt.verifyAsync(state);
      if (decoded?.kind !== 'goauth' || !decoded?.r) throw new Error();
      returnOrigin = String(decoded.r).replace(/\/+$/, '');
    } catch {
      throw new UnauthorizedException('Sesión de Google expirada.');
    }

    const fail = `${returnOrigin}/mi-cuenta?gerror=1`;
    if (!code) return fail;

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.googleClientId(),
          client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
          code,
          grant_type: 'authorization_code',
          redirect_uri: this.googleRedirectUri(),
        }),
      });
      const tokenData: any = await tokenRes.json();
      if (!tokenData?.id_token) return fail;

      const payload: any = this.jwt.decode(tokenData.id_token);
      const emailVerified =
        payload?.email_verified === true ||
        payload?.email_verified === 'true';
      if (
        !payload?.email ||
        payload?.aud !== this.googleClientId() ||
        !emailVerified
      ) {
        return fail;
      }

      const host = returnOrigin.replace(/^https?:\/\//, '');
      const site = await this.website.resolveCompany(host);

      const email = this.normalizeEmail(payload.email);
      const name = payload.name || payload.given_name || email.split('@')[0];
      const customer = await this.findOrCreateEcommerceCustomer(
        email,
        name,
        site.companyId,
        site.localId,
      );

      const token = await this.signToken(customer);
      return `${returnOrigin}/mi-cuenta?gtoken=${encodeURIComponent(token)}`;
    } catch {
      return fail;
    }
  }

  // Decodifica de forma OPCIONAL el token de cliente (para enlazar el pedido en
  // el checkout si hay sesión). Nunca lanza: si no hay/no vale, devuelve null.
  async tryResolveCustomerId(
    authHeader: string | undefined,
    companyId: number,
  ): Promise<number | null> {
    if (!authHeader) return null;
    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) return null;
    try {
      const payload: any = await this.jwt.verifyAsync(token);
      if (
        payload?.kind === 'customer' &&
        payload?.sub &&
        Number(payload.companyId) === Number(companyId)
      ) {
        return Number(payload.sub);
      }
    } catch {
      // token inválido/expirado → checkout como invitado
    }
    return null;
  }
}
