// Extrae los datos de una notificación de Bancolombia (SMS o correo). Detecta
// si es un PAGO RECIBIDO (consignación) o una salida (transferencia enviada),
// y saca valor, nombre del pagador, empresa (destinatario) y llave del QR.

export interface ParsedDeposit {
  direction: 'in' | 'out' | 'unknown';
  amount: number;
  senderName: string | null; // quien pagó
  business: string | null; // nombre de la empresa que recibió (según el banco)
  llave: string | null; // llave del QR / referencia
  reference: string | null;
  raw: string | null;
}

// Convierte "$32,500.00" / "$60,000.00" / "$136,500" / "$50.000" a entero de
// pesos, manejando bien miles y centavos.
function parseAmount(text: string): number {
  const m = text.match(/\$\s*([\d][\d.,]*)/);
  if (!m) return 0;
  const s = m[1];
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  let intPart = s;
  if (hasDot && hasComma) {
    // Ambos separadores: el último es el decimal (ej. $32,500.00 o $5.000,00).
    // Nos quedamos con la parte entera antes de él.
    const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    intPart = s.slice(0, lastSep);
  } else if (hasDot || hasComma) {
    // Un solo tipo de separador. Es AMBIGUO en COP:
    //   "$50.000" → punto de MILES (50000)   |   "$200.00" → punto de CENTAVOS (200)
    // Regla: si aparece UNA sola vez y le siguen EXACTAMENTE 2 dígitos, es
    // decimal (centavos) y lo descartamos; en cualquier otro caso (3 dígitos,
    // o aparece varias veces) son separadores de miles.
    const sep = hasDot ? '.' : ',';
    const parts = s.split(sep);
    const last = parts[parts.length - 1];
    if (parts.length === 2 && last.length === 2) {
      intPart = parts[0]; // centavos → parte entera
    }
    // si no, se dejan como miles y se limpian abajo
  }

  const digits = intPart.replace(/[.,]/g, '');
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

function parseBusiness(text: string): string | null {
  // "Bancolombia: RAGNOR BARBER, recibiste un pago de ..."
  const m = text.match(/Bancolombia:\s*([^,\n]+?),\s*recibiste/i);
  return m ? m[1].trim() : null;
}

function parsePayer(text: string): string | null {
  // "recibiste un pago de ANDRES DUQUE CARDONA por $..."
  const m = text.match(
    /recibiste\s+un\s+pago\s+de\s+(.+?)\s+por\s+\$/i,
  );
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  // Fallback genérico: "de NOMBRE" en mayúsculas.
  const g = text.match(
    /\bde\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ.\s]{2,40}?)(?=\s+(?:por|el|en|con|@|\d)|[.,]|$)/,
  );
  return g ? g[1].replace(/\s+/g, ' ').trim() : null;
}

function parseLlave(text: string): string | null {
  // "conectado a la llave @ragnorbarber el ..." / "a la llave 0089288789 el"
  const m = text.match(/llave\s+(\S+?)\s+el\b/i);
  if (m) return m[1].trim();
  const m2 = text.match(/llave\s+(\S+)/i);
  return m2 ? m2[1].trim().replace(/[.,;]$/, '') : null;
}

function parseReference(text: string): string | null {
  const star = text.match(/\*\s*(\d{3,20})/);
  if (star) return `*${star[1]}`;
  return null;
}

export function parseBankSms(body: any): ParsedDeposit {
  const raw =
    body?.text ?? body?.message ?? body?.sms ?? body?.raw ?? body?.body ?? '';
  const text = String(raw || '');
  const lower = text.toLowerCase();

  // Dirección: recibido (consignación) vs enviado (no interesa).
  let direction: 'in' | 'out' | 'unknown' = 'unknown';
  if (/recibiste\s+un\s+pago|recibiste\s+una\s+transferencia|recibiste\s+\$/i.test(text))
    direction = 'in';
  else if (/transferiste|enviaste|pagaste|retiro|compra\s+por/i.test(lower))
    direction = 'out';

  const amount =
    body?.amount != null && !isNaN(Number(body.amount))
      ? Number(body.amount)
      : parseAmount(text);
  const structuredName = String(body?.name || body?.sender || '').trim();

  return {
    direction,
    amount,
    senderName: structuredName || parsePayer(text),
    business: parseBusiness(text),
    llave: parseLlave(text),
    reference: body?.reference || parseReference(text),
    raw: text || null,
  };
}
