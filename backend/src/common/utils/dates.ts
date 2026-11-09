import { isIsoDate, toLocalDate } from '@moshina/shared';
import { AppException } from '../errors/app-exception';

/** Converts a Prisma @db.Date value (midnight UTC) to YYYY-MM-DD. */
export function dateOnly(value: Date): string;
export function dateOnly(value: Date | null | undefined): string | null;
export function dateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Converts YYYY-MM-DD into a Date suitable for a @db.Date column. */
export function toDbDate(value: string): Date {
  if (!isIsoDate(value)) throw AppException.validation(`Invalid date: ${value}`);
  return new Date(`${value}T00:00:00.000Z`);
}

export function todayTashkent(now: Date = new Date()): string {
  return toLocalDate(now);
}

/** Rejects dates in the future (Tashkent calendar). */
export function assertNotFuture(value: string, field: string, now: Date = new Date()): void {
  if (value > todayTashkent(now)) {
    throw AppException.validation(`${field} cannot be in the future`, [
      { field, messages: ['Date cannot be in the future'] },
    ]);
  }
}
