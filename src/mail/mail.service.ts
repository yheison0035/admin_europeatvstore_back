import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface SmtpConfig {
  host?: string | null;
  port?: number | null;
  user?: string | null;
  pass?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  // Caché de transporters por empresa (clave host|port|user) para no recrearlos.
  private cache = new Map<string, nodemailer.Transporter>();

  constructor() {
    const host = process.env.MAIL_HOST;
    const user = process.env.MAIL_USER;
    const pass = process.env.MAIL_PASS;

    if (host && user && pass) {
      const port = Number(process.env.MAIL_PORT) || 587;
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // SSL en 465; STARTTLS en 587
        auth: { user, pass },
        // No colgar si el puerto SMTP está bloqueado/lento.
        connectionTimeout: 12000,
        greetingTimeout: 12000,
        socketTimeout: 20000,
      });
    } else {
      this.logger.warn(
        'Correo global NO configurado (MAIL_HOST/MAIL_USER/MAIL_PASS). ' +
          'Cada empresa debe configurar su propio correo, o los enlaces se registran en el log.',
      );
    }
  }

  // Devuelve el transporter de la EMPRESA (su propio SMTP) si está configurado;
  // si no, cae al global (env). null si no hay ninguno.
  private resolveTransporter(
    smtp?: SmtpConfig,
  ): { tx: nodemailer.Transporter; from: string } | null {
    if (smtp?.host && smtp?.user && smtp?.pass) {
      const port = Number(smtp.port) || 587;
      const key = `${smtp.host}|${port}|${smtp.user}`;
      let tx = this.cache.get(key);
      if (!tx) {
        tx = nodemailer.createTransport({
          host: smtp.host,
          port,
          secure: port === 465,
          auth: { user: smtp.user, pass: smtp.pass },
          connectionTimeout: 12000,
          greetingTimeout: 12000,
          socketTimeout: 20000,
        });
        this.cache.set(key, tx);
      }
      const email = smtp.fromEmail || smtp.user;
      const from = smtp.fromName ? `"${smtp.fromName}" <${email}>` : email;
      return { tx, from };
    }
    if (this.transporter) {
      const email =
        process.env.MAIL_FROM || process.env.MAIL_USER || 'no-reply@localhost';
      return { tx: this.transporter, from: email };
    }
    return null;
  }

  // Envío por API HTTP de Resend (puerto 443). El remitente va desde un dominio
  // verificado (env RESEND_FROM_EMAIL, ej. no-reply@pegazo.co); el nombre visible
  // es el de cada empresa (branding). No tiene restricción por IP.
  private resendEnabled() {
    return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL;
  }

  // Nombre seguro para la cabecera From (sin caracteres que la rompan).
  private safeName(name?: string) {
    return String(name || 'Tienda')
      .replace(/["<>\r\n,]/g, ' ')
      .trim()
      .slice(0, 60);
  }

  private async sendViaResend(opts: {
    to: string;
    subject: string;
    html: string;
    fromName?: string;
    replyTo?: string | null;
  }) {
    const email = process.env.RESEND_FROM_EMAIL as string;
    const from = `${this.safeName(opts.fromName)} <${email}>`;
    const body: any = {
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.replyTo) body.reply_to = opts.replyTo;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Resend ${res.status}: ${t.slice(0, 200)}`);
    }
  }

  // Envío por API HTTP de Brevo (puerto 443), para hosts que BLOQUEAN SMTP
  // (como Railway). Requiere env BREVO_API_KEY y BREVO_SENDER_EMAIL (remitente
  // verificado en Brevo). El nombre del remitente va por empresa (branding).
  private brevoEnabled() {
    return !!process.env.BREVO_API_KEY && !!process.env.BREVO_SENDER_EMAIL;
  }

  private async sendViaBrevo(opts: {
    to: string;
    subject: string;
    html: string;
    fromName?: string;
    replyTo?: string | null;
  }) {
    const body: any = {
      sender: {
        name: opts.fromName || process.env.BREVO_SENDER_NAME || 'Tienda',
        email: process.env.BREVO_SENDER_EMAIL,
      },
      to: [{ email: opts.to }],
      subject: opts.subject,
      htmlContent: opts.html,
    };
    if (opts.replyTo) body.replyTo = { email: opts.replyTo };

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY as string,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Brevo ${res.status}: ${t.slice(0, 200)}`);
    }
  }

  // DIAGNÓSTICO TEMPORAL: intenta enviar por la cuenta central y devuelve el
  // error exacto. Prueba Brevo (HTTP) si está configurado; si no, SMTP.
  async diag(to: string) {
    if (this.resendEnabled()) {
      try {
        await this.sendViaResend({
          to,
          subject: 'Diagnóstico de correo',
          html: '<p>Prueba de envío por API (Resend).</p>',
          fromName: 'Pegazo',
        });
        return { ok: true, via: 'resend', from: process.env.RESEND_FROM_EMAIL };
      } catch (e: any) {
        return { ok: false, via: 'resend', error: e?.message };
      }
    }
    if (this.brevoEnabled()) {
      try {
        await this.sendViaBrevo({
          to,
          subject: 'Diagnóstico de correo',
          html: '<p>Prueba de envío por API (Brevo).</p>',
          fromName: 'Pegazo',
        });
        return { ok: true, via: 'brevo', from: process.env.BREVO_SENDER_EMAIL };
      } catch (e: any) {
        return { ok: false, via: 'brevo', error: e?.message };
      }
    }
    return this.diagSmtp(to);
  }

  private async diagSmtp(to: string) {
    const r = this.resolveTransporter();
    if (!r) return { ok: false, error: 'Sin transporter: MAIL_* no está cargado en el entorno.' };
    try {
      await r.tx.sendMail({
        from: r.from,
        to,
        subject: 'Diagnóstico de correo',
        text: 'Prueba de envío de la plataforma.',
      });
      return { ok: true, from: r.from };
    } catch (e: any) {
      return { ok: false, from: r.from, error: e?.message, code: e?.code, command: e?.command };
    }
  }

  // Envía un correo de prueba con el SMTP de la empresa (para el botón "probar").
  async sendTest(to: string, smtp: SmtpConfig, companyName = 'Tu tienda') {
    const resolved = this.resolveTransporter(smtp);
    if (!resolved) throw new Error('SMTP no configurado');
    await resolved.tx.sendMail({
      from: resolved.from,
      to,
      subject: `Correo de prueba · ${companyName}`,
      html: `<p style="font-family:Arial,sans-serif">✅ ¡Tu correo quedó configurado correctamente! Este es un mensaje de prueba de <b>${companyName}</b>.</p>`,
    });
  }

  async sendPasswordReset(to: string, resetUrl: string, name?: string) {
    const subject = 'Restablece tu contraseña';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
        <h2 style="color:#1d4ed8;">Restablecer contraseña</h2>
        <p>Hola${name ? ' ' + name : ''},</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.
        Si fuiste tú, haz clic en el botón. El enlace vence en 30 minutos.</p>
        <p style="text-align:center; margin: 24px 0;">
          <a href="${resetUrl}"
             style="background:#1d4ed8; color:#fff; text-decoration:none; padding:12px 22px; border-radius:8px; display:inline-block;">
            Restablecer mi contraseña
          </a>
        </p>
        <p style="font-size:12px; color:#666;">Si el botón no funciona, copia y pega este enlace:<br>
          <a href="${resetUrl}">${resetUrl}</a>
        </p>
        <p style="font-size:12px; color:#666;">Si tú no lo solicitaste, ignora este correo; tu contraseña no cambiará.</p>
      </div>
    `;

    // Sin SMTP configurado: se registra el enlace en el log para poder validar
    // durante la puesta en marcha (no se expone al usuario final).
    if (!this.transporter) {
      this.logger.warn(`[SIN CORREO] Enlace para ${to}: ${resetUrl}`);
      return;
    }

    const from =
      process.env.MAIL_FROM || process.env.MAIL_USER || 'no-reply@localhost';

    await this.transporter.sendMail({ from, to, subject, html });
  }

  // Correo de restablecimiento para el CLIENTE de la tienda online, con la marca
  // de la empresa dueña del dominio (logo, nombre y color). Diseño email-safe
  // (tablas + estilos en línea) para que se vea bien en todos los clientes.
  async sendCustomerPasswordReset(
    to: string,
    resetUrl: string,
    brand: {
      companyName?: string;
      logo?: string | null;
      accentColor?: string | null;
      customerName?: string | null;
      supportEmail?: string | null;
    } = {},
    smtp?: SmtpConfig,
  ) {
    const company = (brand.companyName || 'Tu tienda').trim();
    const accent = this.safeColor(brand.accentColor) || '#111827';
    const logo = brand.logo || '';
    const name = brand.customerName ? String(brand.customerName).trim() : '';
    const year = new Date().getFullYear();

    const subject = `Restablece tu contraseña · ${company}`;
    const html = `
<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <!-- Cabecera con marca -->
        <tr><td style="background:${accent};padding:28px 32px;text-align:center;">
          ${
            logo
              ? `<img src="${logo}" alt="${company}" width="120" style="max-width:120px;max-height:56px;object-fit:contain;display:inline-block;">`
              : `<div style="font-size:22px;font-weight:700;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">${company}</div>`
          }
        </td></tr>
        <!-- Cuerpo -->
        <tr><td style="padding:32px;font-family:Arial,Helvetica,sans-serif;color:#111827;">
          <h1 style="margin:0 0 8px;font-size:20px;color:#111827;">Restablece tu contraseña</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
            Hola${name ? ' ' + name : ''}, recibimos una solicitud para restablecer la
            contraseña de tu cuenta en <strong>${company}</strong>. Si fuiste tú, crea
            tu nueva contraseña con el botón. El enlace vence en <strong>30 minutos</strong>.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
            <tr><td align="center" style="border-radius:12px;background:${accent};">
              <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">
                Crear nueva contraseña
              </a>
            </td></tr>
          </table>
          <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">Si el botón no funciona, copia y pega este enlace:</p>
          <p style="margin:0 0 20px;font-size:12px;word-break:break-all;"><a href="${resetUrl}" style="color:${accent};">${resetUrl}</a></p>
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
            Si tú no solicitaste este cambio, ignora este correo; tu contraseña seguirá igual.
          </p>
        </td></tr>
        <!-- Pie -->
        <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #eef0f3;text-align:center;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">© ${year} ${company}. Todos los derechos reservados.</p>
          ${
            brand.supportEmail
              ? `<p style="margin:6px 0 0;font-size:12px;color:#9ca3af;">¿Necesitas ayuda? Escríbenos a <a href="mailto:${brand.supportEmail}" style="color:#9ca3af;">${brand.supportEmail}</a></p>`
              : ''
          }
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    // PRIORIDAD (si la empresa NO puso su propio SMTP): API por HTTP, que
    // funciona en hosts que bloquean SMTP (como Railway). Resend primero.
    if (!smtp?.host && this.resendEnabled()) {
      await this.sendViaResend({
        to,
        subject,
        html,
        fromName: company,
        replyTo: brand.supportEmail || undefined,
      });
      return;
    }
    if (!smtp?.host && this.brevoEnabled()) {
      await this.sendViaBrevo({
        to,
        subject,
        html,
        fromName: company,
        replyTo: brand.supportEmail || undefined,
      });
      return;
    }

    const resolved = this.resolveTransporter(smtp);
    if (!resolved) {
      this.logger.warn(`[SIN CORREO] Enlace para ${to}: ${resetUrl}`);
      return;
    }

    // Nombre visible del remitente = la empresa (si el SMTP no trae fromName).
    const usingOwn = !!smtp?.host;
    const from = usingOwn ? resolved.from : `"${company}" <${resolved.from}>`;

    // Si se envía por la cuenta central (no la propia de la empresa), las
    // respuestas del cliente deben ir al correo de contacto del negocio.
    const replyTo =
      !usingOwn && brand.supportEmail ? brand.supportEmail : undefined;

    await resolved.tx.sendMail({ from, to, subject, html, replyTo });
  }

  // Solo permite colores hex (#rgb / #rrggbb) para no romper el HTML del correo.
  private safeColor(c?: string | null): string | null {
    if (!c) return null;
    const v = String(c).trim();
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : null;
  }
}
