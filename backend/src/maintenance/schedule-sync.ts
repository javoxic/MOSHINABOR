import type { MaintenanceSchedule, Prisma } from '@prisma/client';
import { computeNextDue } from '@moshina/shared';
import { dateOnly, toDbDate } from '../common/utils/dates';

export async function applyScheduleBaseline(
  tx: Prisma.TransactionClient,
  schedule: Pick<MaintenanceSchedule, 'id' | 'intervalDays' | 'intervalKm'>,
  date: string,
  mileage: number,
): Promise<void> {
  const next = computeNextDue({ lastServiceDate: date, lastServiceMileage: mileage, intervalDays: schedule.intervalDays, intervalKm: schedule.intervalKm });
  await tx.maintenanceSchedule.update({
    where: { id: schedule.id },
    data: {
      lastServiceDate: toDbDate(date),
      lastServiceMileage: mileage,
      nextDueDate: next.nextDueDate ? toDbDate(next.nextDueDate) : null,
      nextDueMileage: next.nextDueMileage,
    },
  });
}

function isNewer(a: { date: string; mileage: number }, b: { date: string; mileage: number }): boolean {
  return a.date > b.date || (a.date === b.date && a.mileage > b.mileage);
}

/**
 * Keeps a schedule's "last service" baseline consistent with the service history:
 * - a newer record becomes the baseline;
 * - if the record that formed the baseline was removed/changed, the latest remaining record becomes the baseline.
 */
export async function resyncSchedule(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  serviceTypeId: string,
  removedBaseline?: { date: string; mileage: number },
): Promise<void> {
  const schedule = await tx.maintenanceSchedule.findUnique({ where: { vehicleId_serviceTypeId: { vehicleId, serviceTypeId } } });
  if (!schedule) return;
  const latest = await tx.maintenanceRecord.findFirst({
    where: { vehicleId, serviceTypeId },
    orderBy: [{ serviceDate: 'desc' }, { mileage: 'desc' }],
  });
  const baseline = { date: dateOnly(schedule.lastServiceDate), mileage: schedule.lastServiceMileage };
  const baselineRemoved =
    removedBaseline !== undefined && removedBaseline.date === baseline.date && removedBaseline.mileage === baseline.mileage;

  if (latest) {
    const candidate = { date: dateOnly(latest.serviceDate), mileage: latest.mileage };
    if (baselineRemoved || isNewer(candidate, baseline)) {
      await applyScheduleBaseline(tx, schedule, candidate.date, candidate.mileage);
    }
  }
}

export function isBaselineOf(schedule: MaintenanceSchedule | null, record: { serviceDate: Date; mileage: number }): boolean {
  return Boolean(
    schedule && dateOnly(schedule.lastServiceDate) === dateOnly(record.serviceDate) && schedule.lastServiceMileage === record.mileage,
  );
}
