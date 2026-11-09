import { addDays, formatNumber, formatUZS, toLocalDate, type Language } from '@moshina/shared';

const LOCALE: Record<string, string> = { uz: 'uz-Latn-UZ', ru: 'ru-RU', en: 'en-GB' };
const MONTHS: Record<string, string[]> = {
  uz: ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'],
  ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

function lang(l: string): Language {
  return (['uz', 'ru', 'en'].includes(l) ? l : 'uz') as Language;
}

/** "2026-06-15" → "15 iyn 2026" (independent of device Intl support). */
export function formatDate(iso: string | null | undefined, l: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  const months = MONTHS[lang(l)] ?? MONTHS.en!;
  return `${Number(d)} ${months[Number(m) - 1] ?? ''} ${y}`;
}

export function monthShort(yyyyMm: string, l: string): string {
  const months = MONTHS[lang(l)] ?? MONTHS.en!;
  return months[Number(yyyyMm.slice(5, 7)) - 1] ?? yyyyMm;
}

export function formatDateTime(d: Date, l: string): string {
  try {
    return new Intl.DateTimeFormat(LOCALE[lang(l)], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

export function money(amount: string | number | null | undefined, l: string): string {
  return formatUZS(amount ?? 0, lang(l));
}

export function km(value: number | null | undefined, l: string): string {
  if (value == null) return '—';
  return `${formatNumber(value, lang(l))} km`;
}

/**
 * Today's date in the Asia/Tashkent calendar (the server's business calendar), independent of the
 * device time zone — a device set ahead of Tashkent would otherwise submit "future" dates.
 */
export function todayLocal(now: Date = new Date()): string {
  return toLocalDate(now);
}

export function daysAgoLocal(days: number, now: Date = new Date()): string {
  return addDays(toLocalDate(now), -days);
}

export function serviceTypeName(t: { nameUz: string; nameRu: string; nameEn: string }, l: string): string {
  const k = lang(l);
  return k === 'ru' ? t.nameRu : k === 'en' ? t.nameEn : t.nameUz;
}

/** Strips formatting from numeric input ("45 000" → "45000"). */
export function digitsOnly(v: string): string {
  return v.replace(/[^\d]/g, '');
}

export function decimalInput(v: string): string {
  const cleaned = v.replace(',', '.').replace(/[^\d.]/g, '');
  const [int, ...rest] = cleaned.split('.');
  return rest.length ? `${int}.${rest.join('').slice(0, 2)}` : (int ?? '');
}
