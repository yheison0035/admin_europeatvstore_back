import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

// URL base de la API de Wompi. Sandbox por defecto; en producción se define
// WOMPI_API_URL=https://production.wompi.co/v1 en las variables de entorno.
const WOMPI_BASE = process.env.WOMPI_API_URL || 'https://sandbox.wompi.co/v1';

@Injectable()
export class WompiService {
  // `integritySecret` opcional: para pagos de la TIENDA se pasa el secreto de la
  // empresa; si no viene, usa el global (suscripción de Pegazo).
  generateSignature({
    reference,
    amountInCents,
    currency,
    integritySecret: overrideSecret,
  }: {
    reference: string;
    amountInCents: number;
    currency: string;
    integritySecret?: string;
  }) {
    const integritySecret = overrideSecret || process.env.WOMPI_INTEGRITY_SECRET;

    if (!integritySecret) {
      throw new Error('WOMPI_INTEGRITY_SECRET no definido');
    }

    const stringToSign =
      `${reference.trim()}` +
      `${Number(amountInCents)}` +
      `${currency.toUpperCase()}` +
      `${integritySecret}`;

    const signature = crypto
      .createHash('sha256')
      .update(stringToSign)
      .digest('hex');

    return { signature };
  }

  async getTransaction(transactionId: string) {
    const response = await fetch(`${WOMPI_BASE}/transactions/${transactionId}`, {
      headers: {
        Authorization: `Bearer ${process.env.WOMPI_PRIVATE_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error('Error consultando transacción en Wompi');
    }

    return response.json();
  }

  // Verifica la firma (checksum) de un evento de webhook de Wompi. `eventsSecret`
  // opcional: el de la empresa (tienda) o el global (suscripción).
  verifyEventChecksum(event: any, eventsSecret?: string): boolean {
    const secret = eventsSecret || process.env.WOMPI_EVENTS_SECRET;
    if (!secret) return false;
    const props: string[] = event?.signature?.properties || [];
    const timestamp = event?.timestamp;
    const checksum = event?.signature?.checksum;
    if (!props.length || !checksum) return false;

    const concatenated =
      props
        .map((p) => p.split('.').reduce((o: any, k) => o?.[k], event?.data))
        .join('') +
      `${timestamp}` +
      secret;

    const computed = crypto
      .createHash('sha256')
      .update(concatenated)
      .digest('hex')
      .toUpperCase();

    return computed === String(checksum).toUpperCase();
  }
}
