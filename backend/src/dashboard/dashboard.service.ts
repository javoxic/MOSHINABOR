import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { SchedulesService } from '../maintenance/schedules.service';
import { RecordsService } from '../maintenance/records.service';
import { ExpensesService } from '../expenses/expenses.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicles: VehiclesService,
    private readonly schedules: SchedulesService,
    private readonly records: RecordsService,
    private readonly expenses: ExpensesService,
  ) {}

  async get(userId: string, vehicleId?: string) {
    let targetId = vehicleId;
    if (!targetId) {
      const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
      targetId = settings?.primaryVehicleId ?? undefined;
      if (!targetId) {
        const first = await this.prisma.vehicle.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
        targetId = first?.id;
      }
    }
    const unreadNotifications = await this.prisma.notification.count({ where: { userId, readAt: null } });
    if (!targetId) {
      return {
        vehicle: null,
        nextMaintenance: null,
        overdue: [],
        upcoming: [],
        recentRecords: [],
        expenseSummary: { monthTotal: '0.00', yearTotal: '0.00', currency: 'UZS' as const },
        unreadNotifications,
        generatedAt: new Date().toISOString(),
      };
    }
    const vehicle = await this.vehicles.get(userId, targetId);
    const [schedules, recent, summary] = await Promise.all([
      this.schedules.list(userId, { vehicleId: targetId }),
      this.records.list(userId, { vehicleId: targetId, page: 1, pageSize: 5 }),
      this.expenses.summary(userId, targetId),
    ]);
    const active = schedules.filter((s) => s.isActive);
    const overdue = active.filter((s) => s.computed.status === 'OVERDUE' || s.computed.status === 'DUE');
    const upcoming = active.filter((s) => s.computed.status === 'DUE_SOON');
    const nextMaintenance =
      active
        .filter((s) => s.computed.status !== 'UNKNOWN')
        .sort((a, b) => (a.computed.daysRemaining ?? Infinity) - (b.computed.daysRemaining ?? Infinity))[0] ?? null;
    return {
      vehicle,
      nextMaintenance: overdue[0] ?? upcoming[0] ?? nextMaintenance,
      overdue,
      upcoming,
      recentRecords: recent.items,
      expenseSummary: { ...summary, currency: 'UZS' as const },
      unreadNotifications,
      generatedAt: new Date().toISOString(),
    };
  }
}
