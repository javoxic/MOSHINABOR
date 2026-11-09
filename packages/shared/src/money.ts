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

export function formatNumber(n: number, lang: Language = 'uz'): string {
  try {
    return new Intl.NumberFormat(LOCALES[lang]).format(n);
  } catch {
    return String(n);
  }
}

/** Parses a decimal money string safely into a number of so'm with 2 decimals precision. */
export function parseMoney(value: string | number): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/[\s ,]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
