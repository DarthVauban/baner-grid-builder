type AvailabilityTone = 'available' | 'waiting' | 'unavailable' | 'unknown';

export function horoshopAvailability(value: string | null | undefined, active = true): { label: string; tone: AvailabilityTone } {
  if (!active) return { label: 'Неактивний', tone: 'unavailable' };
  const label = value?.trim();
  if (!label) return { label: 'Наявність не вказана', tone: 'unknown' };
  const normalized = label.toLocaleLowerCase('uk-UA');
  if (/немає|відсут|нет\s+в\s+налич|out\s+of\s+stock|not\s+available|^0$/u.test(normalized)) {
    return { label, tone: 'unavailable' };
  }
  if (/очіку|під\s+замовлення|предзаказ|preorder|wait/u.test(normalized)) {
    return { label, tone: 'waiting' };
  }
  return { label, tone: 'available' };
}
