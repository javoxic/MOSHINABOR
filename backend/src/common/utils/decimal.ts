import { Prisma } from '@prisma/client';

export function decimalToString(value: Prisma.Decimal | null | undefined): string | null {
  return value == null ? null : value.toFixed(2);
}

export function toDecimal(value: number | string | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  return new Prisma.Decimal(value);
}
