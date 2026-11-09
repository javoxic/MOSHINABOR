import { formatUZS } from '@moshina/shared';

export const fmtMoney = (v: string | number | null | undefined) => (v == null ? '—' : formatUZS(v, 'en'));
export const fmtNumber = (v: number) => new Intl.NumberFormat('en-US').format(v);
export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Tashkent' }).format(new Date(iso)) : '—';
export const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' }).format(new Date(iso))
    : '—';
export const FUEL_LABEL: Record<string, string> = {
  PETROL: 'Petrol', DIESEL: 'Diesel', GAS_METHANE: 'Methane (CNG)', GAS_PROPANE: 'Propane (LPG)', HYBRID: 'Hybrid', ELECTRIC: 'Electric', PETROL_GAS: 'Petrol + gas',
};
export const LANG_LABEL: Record<string, string> = { uz: 'Uzbek', ru: 'Russian', en: 'English' };
