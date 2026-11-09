import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { computeNextDue, statusSeverity } from '@moshina/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { assertNotFuture, dateOnly, toDbDate } from '../common/utils/dates';
import { toDecimal } from '../common/utils/decimal';
import { SystemSettingsService } from '../settings/system-settings.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { ServiceTypesService } from '../service-types/service-types.service';
import type { CompleteScheduleDto, CreateScheduleDto, ScheduleQueryDto, UpdateScheduleDto } from './dto/maintenance.dto';
import { RecordsService, type RecordView } from './records.service';
import { toScheduleView, type ScheduleView } from './schedule-mapper';

const INCLUDE = { serviceType: true, vehicle: { select: { currentMileage: true, mileageUpdatedAt: true } } } as const;

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SystemSettingsService,
    private readonly vehicles: VehiclesService,
    private readonly types: ServiceTypesService,
    private readonly records: RecordsService,
  ) {}

  private async view(id: string): Promise<ScheduleView> {
    const s = await this.prisma.maintenanceSchedule.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    return toScheduleView(s, await this.settings.thresholds());
  }

  private async getOwned(userId: string, id: string, tx: Prisma.TransactionClient = this.prisma) {
    const s = await tx.maintenanceSchedule.findFirst({ where: { id, userId }, include: INCLUDE });
    if (!s) throw AppException.notFound('Maintenance schedule');
    return s;
  }

  async list(userId: string, q: ScheduleQueryDto): Promise<ScheduleView[]> {
    if (q.vehicleId) await this.vehicles.getOwned(userId, q.vehicleId);
    const rows = await this.prisma.maintenanceSchedule.findMany({
      where: { userId, vehicleId: q.vehicleId },
      include: INCLUDE,
    });
    const thresholds = await this.settings.thresholds();
    let views = rows.map((r) => toScheduleView(r, thresholds));
    if (q.status) views = views.filter((v) => v.computed.status === q.status);
    if (q.attentionOnly) views = views.filter((v) => ['DUE_SOON', 'DUE', 'OVERDUE'].includes(v.computed.status));
    return views.sort((a, b) => {
      const sev = statusSeverity(b.computed.status) - statusSeverity(a.computed.status);
      if (sev !== 0) return sev;
      const ad = a.computed.daysRemaining ?? Number.MAX_SAFE_INTEGER;
      const bd = b.computed.daysRemaining ?? Number.MAX_SAFE_INTEGER;
      return ad - bd;
    });
  }

  async get(userId: string, id: string): Promise<ScheduleView> {
    const s = await this.getOwned(userId, id);
    return toScheduleView(s, await this.settings.thresholds());
  }

  async create(userId: string, dto: CreateScheduleDto): Promise<ScheduleView> {
    assertNotFuture(dto.lastServiceDate, 'lastServiceDate');
    const vehicle = await this.vehicles.getOwned(userId, dto.vehicleId);
    await this.types.getUsable(userId, dto.serviceTypeId);
    if (dto.lastServiceMileage > vehicle.currentMileage) {
      throw AppException.validation('Last service mileage cannot exceed the current odometer reading. Update the mileage first.', [
        { field: 'lastServiceMileage', messages: ['Exceeds current mileage'] },
      ]);
    }
    const next = this.next(dto.lastServiceDate, dto.lastServiceMileage, dto.intervalDays ?? null, dto.intervalKm ?? null);
    try {
      const s = await this.prisma.maintenanceSchedule.create({
        data: {
          userId,
          vehicleId: dto.vehicleId,
          serviceTypeId: dto.serviceTypeId,
          lastServiceDate: toDbDate(dto.lastServiceDate),
          lastServiceMileage: dto.lastServiceMileage,
          intervalDays: dto.intervalDays ?? null,
          intervalKm: dto.intervalKm ?? null,
          nextDueDate: next.nextDueDate ? toDbDate(next.nextDueDate) : null,
          nextDueMileage: next.nextDueMileage,
          estimatedCost: toDecimal(dto.estimatedCost ?? null),
          notes: dto.notes ?? null,
        },
      });
      // Link existing history of this service type to the new schedule.
      await this.prisma.maintenanceRecord.updateMany({
        where: { vehicleId: dto.vehicleId, serviceTypeId: dto.serviceTypeId, scheduleId: null },
        data: { scheduleId: s.id },
      });
      return this.view(s.id);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw AppException.conflict('A schedule for this service already exists on this vehicle');
      }
      throw err;
    }
  }

  private next(date: string, mileage: number, intervalDays: number | null, intervalKm: number | null) {
    if (!intervalDays && !intervalKm) {
      throw AppException.validation('Set an interval in days, kilometres or both', [{ field: 'intervalDays', messages: ['Interval required'] }]);
    }
    return computeNextDue({ lastServiceDate: date, lastServiceMileage: mileage, intervalDays, intervalKm });
  }

  async update(userId: string, id: string, dto: UpdateScheduleDto): Promise<ScheduleView> {
    const s = await this.getOwned(userId, id);
    if (dto.lastServiceDate) assertNotFuture(dto.lastServiceDate, 'lastServiceDate');
    const lastServiceDate = dto.lastServiceDate ?? dateOnly(s.lastServiceDate);
    const lastServiceMileage = dto.lastServiceMileage ?? s.lastServiceMileage;
    if (lastServiceMileage > s.vehicle.currentMileage) {
      throw AppException.validation('Last service mileage cannot exceed the current odometer reading', [
        { field: 'lastServiceMileage', messages: ['Exceeds current mileage'] },
      ]);
    }
    const intervalDays = dto.intervalDays !== undefined ? dto.intervalDays : s.intervalDays;
    const intervalKm = dto.intervalKm !== undefined ? dto.intervalKm : s.intervalKm;
    const next = this.next(lastServiceDate, lastServiceMileage, intervalDays, intervalKm);
    await this.prisma.maintenanceSchedule.update({
      where: { id },
      data: {
        lastServiceDate: toDbDate(lastServiceDate),
        lastServiceMileage,
        intervalDays,
        intervalKm,
        nextDueDate: next.nextDueDate ? toDbDate(next.nextDueDate) : null,
        nextDueMileage: next.nextDueMileage,
        estimatedCost: dto.estimatedCost === undefined ? undefined : toDecimal(dto.estimatedCost),
        notes: dto.notes,
        isActive: dto.isActive,
      },
    });
    return this.view(id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOwned(userId, id);
    await this.prisma.maintenanceSchedule.delete({ where: { id } }); // records keep history (schedule_id set null)
  }

  /**
   * Marks maintenance as done: in ONE transaction creates the service record, its expense,
   * records the odometer reading and moves the schedule to the next cycle.
   */
  async complete(userId: string, id: string, dto: CompleteScheduleDto): Promise<{ schedule: ScheduleView; record: RecordView }> {
    const s = await this.getOwned(userId, id);
    if (dto.date < dateOnly(s.lastServiceDate)) {
      throw AppException.validation('Service date is earlier than the previous service', [{ field: 'date', messages: ['Before last service date'] }]);
    }
    if (dto.mileage < s.lastServiceMileage) {
      throw AppException.validation('Mileage is lower than at the previous service', [{ field: 'mileage', messages: ['Below last service mileage'] }]);
    }
    const record = await this.prisma.$transaction((tx) =>
      this.records.createInTx(tx, userId, { ...dto, vehicleId: s.vehicleId, serviceTypeId: s.serviceTypeId }),
    );
    return { schedule: await this.view(id), record: await this.records.get(userId, record.id) };
  }
}
