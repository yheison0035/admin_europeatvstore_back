import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class WompiService {
  generateSignature({
    reference,
    amountInCents,
    currency,
  }: {
    reference: string;
    amountInCents: number;
    currency: string;
  }) {
    const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;

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
    const response = await fetch(
      `https://sandbox.wompi.co/v1/transactions/${transactionId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.WOMPI_PRIVATE_KEY}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error('Error consultando transacción en Wompi');
    }

    return response.json();
  }
}
