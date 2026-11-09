import type { Language } from './constants';

const LOCALES: Record<Language, string> = { uz: 'uz-Latn-UZ', ru: 'ru-RU', en: 'en-US' };
const SUFFIX: Record<Language, string> = { uz: "so'm", ru: 'сум', en: 'UZS' };

/** Formats an amount of Uzbek so'm. Amounts are whole so'm (tiyin are not used in practice). */
export function formatUZS(amount: number | string, lang: Language = 'uz'): string {
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return `0 ${SUFFIX[lang]}`;
  const grouped = Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped} ${SUFFIX[lang]}`;
}

/**
 * Groups thousands with a non-breaking space (the convention in Uzbek and Russian, and unambiguous
 * in English). Implemented without Intl so output is identical on every JS engine.
 */
export function formatNumber(n: number, _lang: Language = 'uz'): string {
  if (!Number.isFinite(n)) return '0';
  const [int, frac] = Math.abs(n).toString().split('.');
  const grouped = (int ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${n < 0 ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`;
}

export const LOCALE_TAGS = LOCALES;

/** Parses a decimal money string safely into a number of so'm with 2 decimals precision. */
export function parseMoney(value: string | number): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/[\s ,]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
