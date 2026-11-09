import { addDays, diffDays, toLocalDate } from './dates';
import { computeNextDue, computeScheduleStatus, DEFAULT_THRESHOLDS } from './maintenance';

const fresh = (now: Date) => new Date(now.getTime() - 86_400_000);

describe('calendar arithmetic', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-01'],
    ['2026-02-28', 1, '2026-03-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2028-02-29', 365, '2029-02-28'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-03-31', 30, '2026-04-30'],
    ['2026-07-01', 180, '2026-12-28'],
    ['2024-02-29', 1461, '2028-02-29'],
  ])('%s + %i days = %s', (from, days, expected) => {
    expect(addDays(from, days)).toBe(expected);
    expect(diffDays(from, expected)).toBe(days);
  });

  it('rejects impossible dates', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow();
    expect(() => addDays('2027-02-29', 1)).toThrow();
  });
});

describe('Asia/Tashkent day boundary (UTC+5, no DST)', () => {
  it('switches the business day at 19:00 UTC', () => {
    expect(toLocalDate(new Date('2026-06-14T18:59:59Z'))).toBe('2026-06-14');
    expect(toLocalDate(new Date('2026-06-14T19:00:00Z'))).toBe('2026-06-15');
    expect(toLocalDate(new Date('2026-12-31T19:00:00Z'))).toBe('2027-01-01');
  });

  it('a schedule becomes DUE exactly at Tashkent midnight of the due date', () => {
    const input = { nextDueDate: '2026-06-15', nextDueMileage: null, currentMileage: 1000, mileageUpdatedAt: null };
    const before = new Date('2026-06-14T18:59:00Z');
    const after = new Date('2026-06-14T19:01:00Z');
    expect(computeScheduleStatus(input, toLocalDate(before), before).status).toBe('DUE_SOON');
    expect(computeScheduleStatus(input, toLocalDate(after), after).status).toBe('DUE');
  });
});

describe('thresholds are inclusive at the exact boundary', () => {
  const now = new Date('2026-06-15T07:00:00Z');
  const today = '2026-06-15';
  const base = { nextDueDate: null, nextDueMileage: null, currentMileage: 50000, mileageUpdatedAt: fresh(now) };
  it.each([
    [{ nextDueDate: addDays(today, 15) }, 'OK'],
    [{ nextDueDate: addDays(today, 14) }, 'DUE_SOON'],
    [{ nextDueDate: addDays(today, 1) }, 'DUE_SOON'],
    [{ nextDueDate: today }, 'DUE'],
    [{ nextDueDate: addDays(today, -6) }, 'DUE'],
    [{ nextDueDate: addDays(today, -7) }, 'OVERDUE'],
    [{ nextDueMileage: 51001 }, 'OK'],
    [{ nextDueMileage: 51000 }, 'DUE_SOON'],
    [{ nextDueMileage: 50000 }, 'DUE'],
    [{ nextDueMileage: 49501 }, 'DUE'],
    [{ nextDueMileage: 49500 }, 'OVERDUE'],
  ])('%j → %s', (patch, expected) => {
    expect(computeScheduleStatus({ ...base, ...patch }, today, now).status).toBe(expected);
  });

  it('mileage is stale only after more than mileageStaleDays', () => {
    const at = (days: number) => new Date(now.getTime() - days * 86_400_000);
    expect(computeScheduleStatus({ ...base, nextDueMileage: 60000, mileageUpdatedAt: at(30) }, today, now).mileageStale).toBe(false);
    expect(computeScheduleStatus({ ...base, nextDueMileage: 60000, mileageUpdatedAt: at(31) }, today, now).mileageStale).toBe(true);
  });

  it('whichever comes first: mileage OVERDUE wins over a date that is still far away', () => {
    const r = computeScheduleStatus({ ...base, nextDueDate: addDays(today, 200), nextDueMileage: 49000 }, today, now);
    expect(r).toMatchObject({ status: 'OVERDUE', triggeredBy: 'MILEAGE', daysRemaining: 200, kmRemaining: -1000 });
  });

  it('whichever comes first: date OVERDUE wins over mileage that is still far away', () => {
    const r = computeScheduleStatus({ ...base, nextDueDate: addDays(today, -30), nextDueMileage: 90000 }, today, now);
    expect(r).toMatchObject({ status: 'OVERDUE', triggeredBy: 'DATE' });
  });

  it('respects custom thresholds', () => {
    const t = { ...DEFAULT_THRESHOLDS, dueSoonDays: 30 };
    expect(computeScheduleStatus({ ...base, nextDueDate: addDays(today, 25) }, today, now, t).status).toBe('DUE_SOON');
  });
});

describe('next due after completion and interval changes', () => {
  it('recomputes from the completion baseline, across leap day', () => {
    expect(computeNextDue({ lastServiceDate: '2027-09-01', lastServiceMileage: 99000, intervalDays: 180, intervalKm: 10000 })).toEqual({
      nextDueDate: '2028-02-28',
      nextDueMileage: 109000,
    });
    expect(computeNextDue({ lastServiceDate: '2027-09-01', lastServiceMileage: 99000, intervalDays: 181, intervalKm: null }).nextDueDate).toBe('2028-02-29');
  });
});
