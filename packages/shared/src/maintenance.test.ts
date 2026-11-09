import {
  computeNextDue,
  computeScheduleStatus,
  scheduleCycleKey,
  DEFAULT_THRESHOLDS,
} from './maintenance';
import { addDays, diffDays, toLocalDate, isIsoDate } from './dates';
import { formatUZS } from './money';

const NOW = new Date('2026-06-15T07:00:00Z'); // 12:00 in Tashkent
const TODAY = '2026-06-15';
const fresh = new Date('2026-06-10T00:00:00Z');

describe('dates', () => {
  it('adds days across month/year boundaries', () => {
    expect(addDays('2026-12-25', 10)).toBe('2027-01-04');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('diffs days', () => {
    expect(diffDays('2026-01-01', '2026-01-31')).toBe(30);
    expect(diffDays('2026-01-31', '2026-01-01')).toBe(-30);
  });
  it('computes Tashkent local date', () => {
    expect(toLocalDate(new Date('2026-06-14T20:30:00Z'))).toBe('2026-06-15'); // UTC+5
  });
  it('validates ISO dates', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-02-28')).toBe(true);
  });
});

describe('computeNextDue', () => {
  it('computes date and mileage', () => {
    expect(
      computeNextDue({
        lastServiceDate: '2026-01-01',
        lastServiceMileage: 50000,
        intervalDays: 180,
        intervalKm: 8000,
      }),
    ).toEqual({ nextDueDate: '2026-06-30', nextDueMileage: 58000 });
  });
  it('supports date-only and km-only intervals', () => {
    expect(
      computeNextDue({
        lastServiceDate: '2026-01-01',
        lastServiceMileage: 1,
        intervalDays: 10,
        intervalKm: null,
      }),
    ).toEqual({ nextDueDate: '2026-01-11', nextDueMileage: null });
    expect(
      computeNextDue({
        lastServiceDate: '2026-01-01',
        lastServiceMileage: 1,
        intervalDays: null,
        intervalKm: 100,
      }),
    ).toEqual({ nextDueDate: null, nextDueMileage: 101 });
  });
  it('requires an interval', () => {
    expect(() =>
      computeNextDue({
        lastServiceDate: '2026-01-01',
        lastServiceMileage: 1,
        intervalDays: null,
        intervalKm: 0,
      }),
    ).toThrow();
  });
});

describe('computeScheduleStatus', () => {
  const base = {
    nextDueDate: null,
    nextDueMileage: null,
    currentMileage: 50000,
    mileageUpdatedAt: fresh,
  };

  it('is UNKNOWN without due data', () => {
    expect(computeScheduleStatus(base, TODAY, NOW).status).toBe('UNKNOWN');
  });

  it('is OK when far from both thresholds', () => {
    const r = computeScheduleStatus(
      { ...base, nextDueDate: '2026-12-01', nextDueMileage: 60000 },
      TODAY,
      NOW,
    );
    expect(r.status).toBe('OK');
    expect(r.kmRemaining).toBe(10000);
  });

  it('triggers by mileage when mileage is reached first', () => {
    const r = computeScheduleStatus(
      { ...base, nextDueDate: '2026-12-01', nextDueMileage: 50500 },
      TODAY,
      NOW,
    );
    expect(r.status).toBe('DUE_SOON');
    expect(r.triggeredBy).toBe('MILEAGE');
  });

  it('triggers by date when date is reached first', () => {
    const r = computeScheduleStatus(
      { ...base, nextDueDate: '2026-06-15', nextDueMileage: 70000 },
      TODAY,
      NOW,
    );
    expect(r.status).toBe('DUE');
    expect(r.triggeredBy).toBe('DATE');
    expect(r.daysRemaining).toBe(0);
  });

  it('becomes OVERDUE after the grace period', () => {
    expect(
      computeScheduleStatus({ ...base, nextDueDate: addDays(TODAY, -7) }, TODAY, NOW).status,
    ).toBe('OVERDUE');
    expect(
      computeScheduleStatus({ ...base, nextDueDate: addDays(TODAY, -6) }, TODAY, NOW).status,
    ).toBe('DUE');
    expect(computeScheduleStatus({ ...base, nextDueMileage: 49500 }, TODAY, NOW).status).toBe(
      'OVERDUE',
    );
  });

  it('flags stale mileage and can ignore it for reminders', () => {
    const stale = {
      ...base,
      nextDueMileage: 49000,
      mileageUpdatedAt: new Date('2026-04-01T00:00:00Z'),
    };
    const shown = computeScheduleStatus(stale, TODAY, NOW, DEFAULT_THRESHOLDS);
    expect(shown.mileageStale).toBe(true);
    expect(shown.status).toBe('OVERDUE');
    const forReminder = computeScheduleStatus(stale, TODAY, NOW, DEFAULT_THRESHOLDS, {
      ignoreStaleMileage: true,
    });
    expect(forReminder.status).toBe('UNKNOWN');
    expect(forReminder.kmRemaining).toBe(-1000);
  });

  it('treats missing mileage timestamp as stale', () => {
    expect(
      computeScheduleStatus({ ...base, mileageUpdatedAt: null }, TODAY, NOW).mileageStale,
    ).toBe(true);
  });
});

describe('scheduleCycleKey', () => {
  it('changes when the schedule is serviced', () => {
    const a = scheduleCycleKey({
      lastServiceDate: '2026-01-01',
      lastServiceMileage: 1000,
      intervalDays: 180,
      intervalKm: null,
    });
    const b = scheduleCycleKey({
      lastServiceDate: '2026-06-01',
      lastServiceMileage: 9000,
      intervalDays: 180,
      intervalKm: null,
    });
    expect(a).not.toBe(b);
  });
});

describe('formatUZS', () => {
  it('groups thousands', () => {
    expect(formatUZS(1250000, 'en')).toBe('1 250 000 UZS');
    expect(formatUZS('350000.00', 'uz')).toBe("350 000 so'm");
  });
});
