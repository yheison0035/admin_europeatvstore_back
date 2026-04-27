export function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function timeToMinutes(time: string) {
  const clean = time
    .replace(/\u00A0/g, ' ') // elimina espacio raro
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

  const [hourPart, minutePart] = clean.split(':');
  const minute = Number(minutePart.substring(0, 2));

  const isPM = clean.includes('p');

  let hour = Number(hourPart);

  if (isPM && hour !== 12) hour += 12;
  if (!isPM && hour === 12) hour = 0;

  return hour * 60 + minute;
}

export function minutesToColombiaHour(minutes: number) {
  let h = Math.floor(minutes / 60);
  const m = minutes % 60;

  const isPM = h >= 12;

  if (h > 12) h -= 12;
  if (h === 0) h = 12;

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${
    isPM ? 'p. m.' : 'a. m.'
  }`;
}
