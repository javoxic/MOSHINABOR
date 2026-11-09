import { Injectable, Logger } from '@nestjs/common';
import type { Language as PrismaLanguage, NotificationType } from '@prisma/client';
import {
  computeScheduleStatus,
  daysBetweenInstants,
  localHour,
  scheduleCycleKey,
  toLocalDate,
  type Language,
} from '@moshina/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SystemSettingsService } from '../settings/system-settings.service';
import { sha256 } from '../common/utils/crypto';
import { dateOnly } from '../common/utils/dates';
import { NotificationsService } from './notifications.service';
import { TemplatesService } from './templates.service';

const QUIET_FROM_HOUR = 21;
const BATCH = 500;

export interface ReminderRunResult {
  skipped?: 'outside_send_window';
  schedulesScanned: number;
  created: number;
  duplicatesSuppressed: number;
  mileagePrompts: number;
}

function serviceName(t: { nameUz: string; nameRu: string; nameEn: string }, lang: Language): string {
  return lang === 'ru' ? t.nameRu : lang === 'en' ? t.nameEn : t.nameUz;
}

/**
 * Scans active schedules and creates reminders. A reminder fires when EITHER the date or the
 * mileage threshold is reached. Mileage thresholds are only used when the odometer reading is
 * fresh; otherwise the user is asked to update the mileage instead.
 *
 * Deduplication: every reminder carries a dedupe key unique per user (DB unique index), built from
 * the schedule id, its current service cycle and the event, so re-running never duplicates.
 */
@Injectable()
export class ReminderEngineService {
  private readonly logger = new Logger(ReminderEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SystemSettingsService,
    private readonly notifications: NotificationsService,
    private readonly templates: TemplatesService,
  ) {}

  async run(now = new Date(), opts: { ignoreSendWindow?: boolean } = {}): Promise<ReminderRunResult> {
    const result: ReminderRunResult = { schedulesScanned: 0, created: 0, duplicatesSuppressed: 0, mileagePrompts: 0 };
    const sendHour = await this.settings.get('reminders.sendHourLocal');
    const hour = localHour(now);
    if (!opts.ignoreSendWindow && (hour < sendHour || hour >= QUIET_FROM_HOUR)) {
      return { ...result, skipped: 'outside_send_window' };
    }

    const thresholds = await this.settings.thresholds();
    const repeatDays = Math.max(1, await this.settings.get('reminders.overdueRepeatDays'));
    const today = toLocalDate(now);
    const epochDay = Math.floor(new Date(`${today}T00:00:00Z`).getTime() / 86_400_000);
    const staleVehicles = new Map<string, { userId: string; lang: Language; label: string; days: number }>();

    let cursor: string | undefined;
    for (;;) {
      const schedules = await this.prisma.maintenanceSchedule.findMany({
        where: {
          isActive: true,
          user: { status: 'ACTIVE', settings: { is: { OR: [{ maintenanceReminders: true }, { mileageReminders: true }] } } },
        },
        include: {
          serviceType: true,
          vehicle: true,
          user: { select: { settings: true } },
        },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (schedules.length === 0) break;
      cursor = schedules[schedules.length - 1]?.id;

      for (const s of schedules) {
        result.schedulesScanned += 1;
        const prefs = s.user.settings;
        if (!prefs) continue;
        const lang = (prefs.language as PrismaLanguage) as Language;
        const vehicleLabel = `${s.vehicle.brand} ${s.vehicle.model} (${s.vehicle.registrationNumber})`;
        const status = computeScheduleStatus(
          {
            nextDueDate: dateOnly(s.nextDueDate),
            nextDueMileage: s.nextDueMileage,
            currentMileage: s.vehicle.currentMileage,
            mileageUpdatedAt: s.vehicle.mileageUpdatedAt,
          },
          today,
          now,
          thresholds,
          { ignoreStaleMileage: true },
        );

        if (s.intervalKm && status.mileageStale && prefs.mileageReminders) {
          const days = s.vehicle.mileageUpdatedAt ? daysBetweenInstants(s.vehicle.mileageUpdatedAt, now) : thresholds.mileageStaleDays;
          staleVehicles.set(s.vehicleId, { userId: s.userId, lang, label: vehicleLabel, days });
        }
        if (!prefs.maintenanceReminders) continue;

        let type: NotificationType | null = null;
        let suffix = '';
        if (status.status === 'DUE_SOON') type = 'MAINTENANCE_UPCOMING';
        else if (status.status === 'DUE') type = 'MAINTENANCE_DUE';
        else if (status.status === 'OVERDUE') {
          type = 'MAINTENANCE_OVERDUE';
          suffix = `:${Math.floor(epochDay / repeatDays)}`;
        }
        if (!type) continue;

        const cycle = sha256(
          scheduleCycleKey({
            lastServiceDate: dateOnly(s.lastServiceDate),
            lastServiceMileage: s.lastServiceMileage,
            intervalDays: s.intervalDays,
            intervalKm: s.intervalKm,
          }),
        ).slice(0, 12);
        const rendered = await this.templates.render(type, lang, {
          service: serviceName(s.serviceType, lang),
          vehicle: vehicleLabel,
          days: status.daysRemaining != null ? Math.max(0, status.daysRemaining) : null,
          km: status.kmRemaining != null && status.triggeredBy === 'MILEAGE' ? Math.max(0, status.kmRemaining) : null,
          date: dateOnly(s.nextDueDate),
        });
        if (!rendered) continue;
        const created = await this.notifications.create({
          userId: s.userId,
          type,
          title: rendered.title,
          body: rendered.body,
          data: { scheduleId: s.id, vehicleId: s.vehicleId, triggeredBy: status.triggeredBy ?? 'DATE' },
          dedupeKey: `sched:${s.id}:${cycle}:${type}${suffix}`,
        });
        if (created) result.created += 1;
        else result.duplicatesSuppressed += 1;
      }
      if (schedules.length < BATCH) break;
    }

    const staleBucketDays = Math.max(1, thresholds.mileageStaleDays);
    for (const [vehicleId, v] of staleVehicles) {
      const rendered = await this.templates.render('MILEAGE_UPDATE_REQUIRED', v.lang, { vehicle: v.label, days: v.days });
      if (!rendered) continue;
      const created = await this.notifications.create({
        userId: v.userId,
        type: 'MILEAGE_UPDATE_REQUIRED',
        title: rendered.title,
        body: rendered.body,
        data: { vehicleId },
        dedupeKey: `veh:${vehicleId}:MILEAGE:${Math.floor(epochDay / staleBucketDays)}`,
      });
      if (created) result.mileagePrompts += 1;
      else result.duplicatesSuppressed += 1;
    }

    if (result.created || result.mileagePrompts) {
      this.logger.log(`Reminders: ${result.created} maintenance, ${result.mileagePrompts} mileage prompts, ${result.duplicatesSuppressed} suppressed`);
    }
    return result;
  }
}
