import { addDays, diffDays, daysBetweenInstants } from './dates';
import type { ScheduleStatus } from './constants';

export interface ReminderThresholds {
  dueSoonDays: number;
  dueSoonKm: number;
  overdueGraceDays: number;
  overdueGraceKm: number;
  mileageStaleDays: number;
}

export const DEFAULT_THRESHOLDS: ReminderThresholds = {
  dueSoonDays: 14,
  dueSoonKm: 1000,
  overdueGraceDays: 7,
  overdueGraceKm: 500,
  mileageStaleDays: 30,
};

export interface NextDueInput {
  lastServiceDate: string;
  lastServiceMileage: number;
  intervalDays: number | null;
  intervalKm: number | null;
}

export interface NextDue {
  nextDueDate: string | null;
  nextDueMileage: number | null;
}

/** Next due date/mileage based on the last service and the configured intervals. */
export function computeNextDue(input: NextDueInput): NextDue {
  const { lastServiceDate, lastServiceMileage, intervalDays, intervalKm } = input;
  if ((intervalDays == null || intervalDays <= 0) && (intervalKm == null || intervalKm <= 0)) {
    throw new Error('At least one positive interval (days or kilometres) is required');
  }
  return {
    nextDueDate: intervalDays && intervalDays > 0 ? addDays(lastServiceDate, intervalDays) : null,
    nextDueMileage: intervalKm && intervalKm > 0 ? lastServiceMileage + intervalKm : null,
  };
}

export interface StatusInput {
  nextDueDate: string | null;
  nextDueMileage: number | null;
  currentMileage: number | null;
  mileageUpdatedAt: Date | null;
}

export interface StatusResult {
  status: ScheduleStatus;
  dateStatus: ScheduleStatus;
  mileageStatus: ScheduleStatus;
  daysRemaining: number | null;
  kmRemaining: number | null;
  /** Which threshold drives the overall status. */
  triggeredBy: 'DATE' | 'MILEAGE' | null;
  /** True when the odometer reading is older than the stale threshold or missing. */
  mileageStale: boolean;
}

const SEVERITY: Record<ScheduleStatus, number> = {
  UNKNOWN: 0,
  OK: 1,
  DUE_SOON: 2,
  DUE: 3,
  OVERDUE: 4,
};

export function worstStatus(a: ScheduleStatus, b: ScheduleStatus): ScheduleStatus {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

export function statusSeverity(s: ScheduleStatus): number {
  return SEVERITY[s];
}

function classify(remaining: number, soon: number, grace: number): ScheduleStatus {
  if (remaining <= -grace) return 'OVERDUE';
  if (remaining <= 0) return 'DUE';
  if (remaining <= soon) return 'DUE_SOON';
  return 'OK';
}

/**
 * Computes the maintenance status for a schedule. The schedule becomes due when EITHER the date
 * threshold OR the mileage threshold is reached — whichever comes first.
 *
 * `options.ignoreStaleMileage` excludes the mileage component when the odometer reading is stale.
 * The reminder engine uses this so that it never sends a mileage-based alert from outdated data.
 */
export function computeScheduleStatus(
  input: StatusInput,
  today: string,
  now: Date,
  thresholds: ReminderThresholds = DEFAULT_THRESHOLDS,
  options: { ignoreStaleMileage?: boolean } = {},
): StatusResult {
  const mileageStale =
    input.mileageUpdatedAt == null ||
    daysBetweenInstants(input.mileageUpdatedAt, now) > thresholds.mileageStaleDays;

  let dateStatus: ScheduleStatus = 'UNKNOWN';
  let daysRemaining: number | null = null;
  if (input.nextDueDate) {
    daysRemaining = diffDays(today, input.nextDueDate);
    dateStatus = classify(daysRemaining, thresholds.dueSoonDays, thresholds.overdueGraceDays);
  }

  let mileageStatus: ScheduleStatus = 'UNKNOWN';
  let kmRemaining: number | null = null;
  if (input.nextDueMileage != null && input.currentMileage != null) {
    kmRemaining = input.nextDueMileage - input.currentMileage;
    if (!(options.ignoreStaleMileage && mileageStale)) {
      mileageStatus = classify(kmRemaining, thresholds.dueSoonKm, thresholds.overdueGraceKm);
    }
  }

  const status = worstStatus(dateStatus, mileageStatus);
  let triggeredBy: 'DATE' | 'MILEAGE' | null = null;
  if (status !== 'UNKNOWN' && status !== 'OK') {
    if (SEVERITY[dateStatus] > SEVERITY[mileageStatus]) triggeredBy = 'DATE';
    else if (SEVERITY[mileageStatus] > SEVERITY[dateStatus]) triggeredBy = 'MILEAGE';
    else {
      // Same severity: pick the dimension that is proportionally further along.
      const dateRatio =
        daysRemaining != null ? daysRemaining / Math.max(1, thresholds.dueSoonDays) : Infinity;
      const kmRatio =
        kmRemaining != null ? kmRemaining / Math.max(1, thresholds.dueSoonKm) : Infinity;
      triggeredBy = kmRatio < dateRatio ? 'MILEAGE' : 'DATE';
    }
  }

  return {
    status,
    dateStatus,
    mileageStatus,
    daysRemaining,
    kmRemaining,
    triggeredBy,
    mileageStale,
  };
}

/**
 * A stable key identifying the current service cycle of a schedule. It changes whenever the
 * schedule is completed or its intervals change, which resets reminder deduplication.
 */
export function scheduleCycleKey(s: {
  lastServiceDate: string;
  lastServiceMileage: number;
  intervalDays: number | null;
  intervalKm: number | null;
}): string {
  return `${s.lastServiceDate}|${s.lastServiceMileage}|${s.intervalDays ?? '-'}|${s.intervalKm ?? '-'}`;
}
