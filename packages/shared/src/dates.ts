import { TIMEZONE } from './constants';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Returns the calendar date (YYYY-MM-DD) of an instant in the given time zone. */
export function toLocalDate(instant: Date, timeZone: string = TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Hour (0-23) of an instant in the given time zone. */
export function localHour(instant: Date, timeZone: string = TIMEZONE): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(instant);
  return Number.parseInt(h, 10);
}

export function addDays(date: string, days: number): string {
  if (!isIsoDate(date)) throw new Error(`Invalid ISO date: ${date}`);
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / DAY_MS);
}

/** Days elapsed between two instants. */
export function daysBetweenInstants(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}
