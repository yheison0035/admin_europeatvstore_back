import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

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
      });
    } else {
      this.logger.warn(
        'Correo NO configurado (faltan MAIL_HOST/MAIL_USER/MAIL_PASS). ' +
          'Los enlaces de restablecimiento se registrarán en el log.',
      );
    }
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

    if (!this.transporter) {
      this.logger.warn(`[SIN CORREO] Enlace para ${to}: ${resetUrl}`);
      return;
    }

    const fromEmail =
      process.env.MAIL_FROM || process.env.MAIL_USER || 'no-reply@localhost';
    // Nombre visible del remitente = la empresa.
    const from = `"${company}" <${fromEmail}>`;

    await this.transporter.sendMail({ from, to, subject, html });
  }

  // Solo permite colores hex (#rgb / #rrggbb) para no romper el HTML del correo.
  private safeColor(c?: string | null): string | null {
    if (!c) return null;
    const v = String(c).trim();
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : null;
  }
}
