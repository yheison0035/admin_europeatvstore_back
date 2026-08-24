// Extrae valor, nombre y referencia de un SMS de Bancolombia (u otro banco).
// Es "mejor esfuerzo": si algo no viene en el texto, queda null y se conserva
// el SMS completo. Acepta también campos ya estructurados si el reenviador los
// manda (amount/name/reference).

export interface ParsedDeposit {
  amount: number;
  senderName: string | null;
  reference: string | null;
  raw: string | null;
}

function parseAmount(text: string): number {
  // Busca el primer monto tipo $50.000 / $ 1,250,000 / $80000.
  const m = text.match(/\$\s*([\d][\d.,]*)/);
  if (!m) return 0;
  // Formato colombiano: el separador de miles suele ser "." o ",". Se quitan
  // todos los separadores y se toma como entero (los SMS no traen centavos).
  const digits = m[1].replace(/[.,]/g, '');
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

function parseSender(text: string): string | null {
  // Nombre después de "de " en mayúsculas, hasta una palabra clave o el final.
  const m = text.match(
    /\bde\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ.\s]{2,40}?)(?=\s+(?:por|el|en|con|cta|cuenta|ref|hora|a\s+las|\d)|[.,;\n]|$)/,
  );
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  return null;
}

function parseReference(text: string): string | null {
  const star = text.match(/\*\s*(\d{3,6})/); // últimos dígitos de cuenta
  if (star) return `*${star[1]}`;
  const ref = text.match(/\bref(?:erencia)?[:\s#]*([\w-]{3,30})/i);
  if (ref) return ref[1];
  return null;
}

export function parseBankSms(body: any): ParsedDeposit {
  const raw =
    body?.text ?? body?.message ?? body?.sms ?? body?.raw ?? body?.body ?? '';
  const text = String(raw || '');

  // Si el reenviador ya mandó campos estructurados, se respetan.
  const amount =
    body?.amount != null && !isNaN(Number(body.amount))
      ? Number(body.amount)
      : parseAmount(text);
  const structuredName = String(body?.name || body?.sender || '').trim();

  return {
    amount,
    senderName: structuredName || parseSender(text),
    reference: body?.reference || parseReference(text),
    raw: text || null,
  };
}
