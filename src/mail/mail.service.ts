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
}
