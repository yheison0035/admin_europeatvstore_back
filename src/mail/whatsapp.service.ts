import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  // Envía el código OTP por WhatsApp usando la Cloud API de Meta. Requiere una
  // plantilla de autenticación aprobada (con el código en el cuerpo). Config por
  // env: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE, WHATSAPP_LANG.
  async sendOtp(phone: string, code: string) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const template = process.env.WHATSAPP_TEMPLATE || 'otp_password_reset';
    const lang = process.env.WHATSAPP_LANG || 'es';

    // Sin configurar: se registra el código en el log para poder validar durante
    // la puesta en marcha (no se expone al usuario final).
    if (!token || !phoneId || !phone) {
      this.logger.warn(`[SIN WHATSAPP] Código para ${phone}: ${code}`);
      return;
    }

    const digits = String(phone).replace(/\D/g, '');
    // Agrega indicativo Colombia (57) si el número viene sin él (10 dígitos).
    const to = digits.length === 10 ? `57${digits}` : digits;

    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: template,
        language: { code: lang },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          {
            type: 'button',
            sub_type: 'copy_code',
            index: '0',
            parameters: [{ type: 'coupon_code', coupon_code: code }],
          },
        ],
      },
    };

    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${phoneId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const txt = await res.text();
        this.logger.error(`Error WhatsApp API ${res.status}: ${txt}`);
      }
    } catch (e) {
      this.logger.error(`Fallo al enviar WhatsApp: ${e}`);
    }
  }
}
