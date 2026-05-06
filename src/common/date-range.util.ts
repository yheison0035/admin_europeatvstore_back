export function getDayRange(date: string) {
  if (!date) throw new Error('Fecha requerida');

  const clean = date.includes('T') ? date.split('T')[0] : date;

  return {
    start: new Date(`${clean}T00:00:00.000-05:00`),
    end: new Date(`${clean}T23:59:59.999-05:00`),
  };
}

export function getRangeDates(startDate: string, endDate: string) {
  if (!startDate || !endDate) {
    throw new Error('Fechas requeridas');
  }

  const startClean = startDate.includes('T')
    ? startDate.split('T')[0]
    : startDate;

  const endClean = endDate.includes('T') ? endDate.split('T')[0] : endDate;

  return {
    start: new Date(`${startClean}T00:00:00.000-05:00`),
    end: new Date(`${endClean}T23:59:59.999-05:00`),
  };
}

export function formatLocalDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
  }).format(date);
}
