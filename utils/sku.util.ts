/**
 * Normaliza texto:
 * - quita tildes
 * - elimina caracteres especiales
 * - convierte a MAYÚSCULAS
 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/gi, '')
    .toUpperCase()
    .trim();
}

/**
 * Genera código de producto a partir del nombre
 * Ej:
 * "Licuadora Portátil Recargable" → LPR
 */
function productCode(name: string): string {
  const words = normalize(name).split(' ').filter(Boolean);

  return (
    (words[0]?.[0] || '') +
    (words[1]?.[0] || '') +
    (words[2]?.[0] || '')
  ).padEnd(3, 'X');
}

/**
 * Código corto de color
 * NEGRO → NG
 * AZUL  → AZ
 */
function colorCode(color: string): string {
  const c = normalize(color);
  return c.slice(0, 2);
}

/**
 * SKU FINAL
 * Ej:
 * LPR-0005-NG
 */
export function generateSku(
  productName: string,
  sequence: number,
  color: string,
): string {
  const product = productCode(productName);
  const seq = sequence.toString().padStart(4, '0');
  const colorPart = colorCode(color);

  return `${product}-${seq}-${colorPart}`;
}
