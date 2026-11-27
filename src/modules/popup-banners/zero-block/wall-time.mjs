function partsAt(timestamp, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(timestamp);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function wallToUtc(value, timezone) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Вкажіть дату й час у форматі YYYY-MM-DD HH:mm');
  const [year, month, day, hour, minute] = value.match(/\d+/g).map(Number);
  const base = Date.UTC(year, month - 1, day, hour, minute);
  if (!Number.isFinite(base) || new Date(base).getUTCDate() !== day || hour > 23 || minute > 59) throw new Error('Некоректна дата й час');
  const found = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = base + offset * 60000;
    const parts = partsAt(candidate, timezone);
    if (+parts.year === year && +parts.month === month && +parts.day === day && +parts.hour === hour && +parts.minute === minute) found.push(candidate);
  }
  if (found.length !== 1) throw new Error('Цей місцевий час не існує або повторюється через перехід на літній час');
  return new Date(found[0]).toISOString();
}
