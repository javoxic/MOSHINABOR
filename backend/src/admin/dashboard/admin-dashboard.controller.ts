import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, RequirePermissions } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminGuard } from '../admin.guard';

@ApiTags('Admin · Dashboard')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@Controller({ path: 'admin/dashboard', version: '1' })
export class AdminDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  @RequirePermissions('dashboard.view')
  @ApiOperation({ summary: 'Platform statistics computed from live data' })
  async stats() {
    const now = Date.now();
    const d30 = new Date(now - 30 * 86_400_000);
    const [users, active, vehicles, records, schedules, sent30, regs, recordsByMonth, notifStatus, fuel, langs] = await Promise.all([
      this.prisma.user.count({ where: { status: { not: 'DELETED' } } }),
      this.prisma.user.count({ where: { lastActiveAt: { gte: d30 } } }),
      this.prisma.vehicle.count(),
      this.prisma.maintenanceRecord.count(),
      this.prisma.maintenanceSchedule.count({ where: { isActive: true } }),
      this.prisma.notification.count({ where: { createdAt: { gte: d30 } } }),
      this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT to_char(d::date, 'YYYY-MM-DD') AS date, COUNT(u.id) AS count
        FROM generate_series((now() AT TIME ZONE 'Asia/Tashkent')::date - 29, (now() AT TIME ZONE 'Asia/Tashkent')::date, '1 day') d
        LEFT JOIN users u ON (u.created_at AT TIME ZONE 'Asia/Tashkent')::date = d::date
        GROUP BY d ORDER BY d`,
      this.prisma.$queryRaw<{ month: string; count: bigint }[]>`
        SELECT to_char(m, 'YYYY-MM') AS month, COUNT(r.id) AS count
        FROM generate_series(date_trunc('month', now() AT TIME ZONE 'Asia/Tashkent') - interval '11 months', date_trunc('month', now() AT TIME ZONE 'Asia/Tashkent'), '1 month') m
        LEFT JOIN maintenance_records r ON date_trunc('month', r.service_date) = m
        GROUP BY m ORDER BY m`,
      this.prisma.notification.groupBy({ by: ['pushStatus'], _count: true, where: { createdAt: { gte: d30 } } }),
      this.prisma.vehicle.groupBy({ by: ['fuelType'], _count: true }),
      this.prisma.userSettings.groupBy({ by: ['language'], _count: true }),
    ]);
    return {
      totals: { users, activeUsers30d: active, vehicles, maintenanceRecords: records, schedules, notificationsSent30d: sent30 },
      registrationsByDay: regs.map((r) => ({ date: r.date, count: Number(r.count) })),
      recordsByMonth: recordsByMonth.map((r) => ({ month: r.month, count: Number(r.count) })),
      notificationsByStatus: notifStatus.map((n) => ({ status: n.pushStatus, count: n._count })),
      vehiclesByFuelType: fuel.map((f) => ({ fuelType: f.fuelType, count: f._count })).sort((a, b) => b.count - a.count),
      usersByLanguage: langs.map((l) => ({ language: l.language, count: l._count })),
    };
  }
}
