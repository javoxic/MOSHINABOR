import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { maskPhone } from '@moshina/shared';
import { CurrentAdmin, Public, RequirePermissions, type AuthAdmin } from '../../common/decorators/auth.decorators';
import { AppException } from '../../common/errors/app-exception';
import { paginate, parseSort } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemSettingsService } from '../../settings/system-settings.service';
import { toScheduleView } from '../../maintenance/schedule-mapper';
import { AdminGuard } from '../admin.guard';
import { AdminVehicleQueryDto } from '../dto/admin.dto';

@ApiTags('Admin · Vehicles')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@Controller({ path: 'admin/vehicles', version: '1' })
export class AdminVehiclesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SystemSettingsService,
  ) {}

  @Get()
  @RequirePermissions('vehicles.view')
  @ApiOperation({ summary: 'List vehicles with owner information' })
  async list(@CurrentAdmin() admin: AuthAdmin, @Query() q: AdminVehicleQueryDto) {
    const pii = admin.permissions.has('users.view_pii');
    const where: Prisma.VehicleWhereInput = {
      fuelType: q.fuelType,
      userId: q.ownerId,
      year: q.yearFrom || q.yearTo ? { gte: q.yearFrom, lte: q.yearTo } : undefined,
    };
    const term = q.q?.trim();
    if (term) {
      where.OR = [
        { brand: { contains: term, mode: 'insensitive' } },
        { model: { contains: term, mode: 'insensitive' } },
        { registrationNumber: { contains: term.toUpperCase() } },
        { vin: { contains: term.toUpperCase() } },
      ];
    }
    const sort = parseSort(q.sort, ['createdAt', 'year', 'currentMileage', 'brand'] as const, { field: 'createdAt', dir: 'desc' });
    const [rows, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, phone: true } } },
        orderBy: { [sort.field]: sort.dir },
        ...paginate(q),
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return {
      items: rows.map((v) => ({
        id: v.id,
        brand: v.brand,
        model: v.model,
        year: v.year,
        registrationNumber: v.registrationNumber,
        fuelType: v.fuelType,
        currentMileage: v.currentMileage,
        owner: { id: v.user.id, fullName: v.user.fullName, phone: pii ? v.user.phone : maskPhone(v.user.phone) },
        createdAt: v.createdAt.toISOString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  @Get(':id')
  @RequirePermissions('vehicles.view')
  @ApiOperation({ summary: 'Vehicle details (schedules, record count, expense total)' })
  async detail(@CurrentAdmin() admin: AuthAdmin, @Param('id', ParseUUIDPipe) id: string) {
    const pii = admin.permissions.has('users.view_pii');
    const v = await this.prisma.vehicle.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, phone: true } },
        schedules: { include: { serviceType: true } },
        _count: { select: { records: true } },
      },
    });
    if (!v) throw AppException.notFound('Vehicle');
    const [expense, thresholds] = await Promise.all([
      this.prisma.expense.aggregate({ where: { vehicleId: id }, _sum: { amount: true } }),
      this.settings.thresholds(),
    ]);
    return {
      id: v.id,
      brand: v.brand,
      model: v.model,
      year: v.year,
      registrationNumber: v.registrationNumber,
      fuelType: v.fuelType,
      currentMileage: v.currentMileage,
      owner: { id: v.user.id, fullName: v.user.fullName, phone: pii ? v.user.phone : maskPhone(v.user.phone) },
      createdAt: v.createdAt.toISOString(),
      vin: v.vin,
      engineSize: v.engineSize?.toFixed(1) ?? null,
      mileageUpdatedAt: v.mileageUpdatedAt?.toISOString() ?? null,
      schedules: v.schedules.map((s) => {
        const view = toScheduleView({ ...s, vehicle: { currentMileage: v.currentMileage, mileageUpdatedAt: v.mileageUpdatedAt } }, thresholds);
        return { id: s.id, serviceType: s.serviceType.nameEn, nextDueDate: view.nextDueDate, nextDueMileage: view.nextDueMileage, status: view.computed.status };
      }),
      recordCount: v._count.records,
      expenseTotal: (expense._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
    };
  }
}
