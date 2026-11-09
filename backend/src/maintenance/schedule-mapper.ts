import type { MaintenanceSchedule, ServiceType, Vehicle } from '@prisma/client';
import { computeScheduleStatus, type ReminderThresholds, type ScheduleStatus } from '@moshina/shared';
import { dateOnly, todayTashkent } from '../common/utils/dates';
import { decimalToString } from '../common/utils/decimal';
import { serviceTypeView, type ServiceTypeView } from '../service-types/service-types.service';

export type ScheduleWithRelations = MaintenanceSchedule & {
  serviceType: ServiceType;
  vehicle: Pick<Vehicle, 'currentMileage' | 'mileageUpdatedAt'>;
};

export interface ScheduleView {
  id: string;
  vehicleId: string;
  serviceType: ServiceTypeView;
  lastServiceDate: string;
  lastServiceMileage: number;
  intervalDays: number | null;
  intervalKm: number | null;
  nextDueDate: string | null;
  nextDueMileage: number | null;
  estimatedCost: string | null;
  notes: string | null;
  isActive: boolean;
  computed: {
    status: ScheduleStatus;
    daysRemaining: number | null;
    kmRemaining: number | null;
    triggeredBy: 'DATE' | 'MILEAGE' | null;
    mileageStale: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export function toScheduleView(s: ScheduleWithRelations, thresholds: ReminderThresholds, now = new Date()): ScheduleView {
  const r = computeScheduleStatus(
    {
      nextDueDate: dateOnly(s.nextDueDate),
      nextDueMileage: s.nextDueMileage,
      currentMileage: s.vehicle.currentMileage,
      mileageUpdatedAt: s.vehicle.mileageUpdatedAt,
    },
    todayTashkent(now),
    now,
    thresholds,
  );
  return {
    id: s.id,
    vehicleId: s.vehicleId,
    serviceType: serviceTypeView(s.serviceType),
    lastServiceDate: dateOnly(s.lastServiceDate),
    lastServiceMileage: s.lastServiceMileage,
    intervalDays: s.intervalDays,
    intervalKm: s.intervalKm,
    nextDueDate: dateOnly(s.nextDueDate),
    nextDueMileage: s.nextDueMileage,
    estimatedCost: decimalToString(s.estimatedCost),
    notes: s.notes,
    isActive: s.isActive,
    computed: {
      status: s.isActive ? r.status : 'UNKNOWN',
      daysRemaining: r.daysRemaining,
      kmRemaining: r.kmRemaining,
      triggeredBy: r.triggeredBy,
      mileageStale: r.mileageStale,
    },
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
