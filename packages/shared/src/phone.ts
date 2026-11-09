import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

export interface NormalizedPhone {
  e164: string;
  country: string | undefined;
  national: string;
}

/**
 * Normalizes a user-entered phone number into E.164. Numbers without a leading "+" are
 * interpreted as Uzbekistan numbers (e.g. "90 123 45 67" or "998901234567").
 * Only mobile (or fixed-line-or-mobile) numbers are accepted because an SMS must be delivered.
 */
export function normalizePhone(
  input: string,
  defaultCountry: CountryCode = 'UZ',
): NormalizedPhone | null {
  if (typeof input !== 'string') return null;
  let cleaned = input.trim().replace(/[\s\-().]/g, '');
  if (cleaned.length === 0 || cleaned.length > 20) return null;
  if (cleaned.startsWith('00')) cleaned = `+${cleaned.slice(2)}`;
  if (!cleaned.startsWith('+') && /^998\d{9}$/.test(cleaned)) cleaned = `+${cleaned}`;
  if (!/^\+?\d+$/.test(cleaned)) return null;

  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  const type = parsed.getType();
  if (type !== undefined && type !== 'MOBILE' && type !== 'FIXED_LINE_OR_MOBILE') return null;
  return {
    e164: parsed.number,
    country: parsed.country,
    national: parsed.formatInternational(),
  };
}

export function isUzbekPhone(e164: string): boolean {
  return /^\+998\d{9}$/.test(e164);
}

/** Masks a phone for display to staff without the users.view_pii permission. */
export function maskPhone(e164: string): string {
  if (!e164 || e164.length < 6) return '***';
  const visibleStart = e164.startsWith('+998') ? 6 : 4;
  const start = e164.slice(0, visibleStart);
  const end = e164.slice(-2);
  return `${start}${'*'.repeat(Math.max(0, e164.length - visibleStart - 2))}${end}`;
}

export function formatPhoneDisplay(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatInternational() : e164;
}
