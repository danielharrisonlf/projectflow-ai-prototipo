/* Datas "AAAA-MM-DD" são dias do calendário local (não UTC), como em core.js. */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayLocal(offsetDays = 0, now: Date = new Date()): string {
  const d = new Date(now.getTime());
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  return ymd(d);
}

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** Dias até a data: 0 = hoje, -1 = ontem; null se a data for inválida. */
export function daysLeft(dateOnly: string | null | undefined, now: Date = new Date()): number | null {
  if (!isDateOnly(dateOnly)) return null;
  const [y, m, d] = dateOnly.split('-').map(Number) as [number, number, number];
  const today = new Date(now.getTime());
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000);
}

export function nowIso(): string {
  return new Date().toISOString();
}
