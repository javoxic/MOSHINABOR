import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import {
  CurrentAdmin,
  Public,
  RequirePermissions,
  type AuthAdmin,
} from '../../common/decorators/auth.decorators';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminServiceTypeDto } from '../../service-types/dto/service-types.dto';
import { serviceTypeView } from '../../service-types/service-types.service';
import { AdminGuard } from '../admin.guard';
import { AuditService } from '../audit.service';

@ApiTags('Admin · Maintenance')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@Controller({ path: 'admin/maintenance', version: '1' })
export class AdminMaintenanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('service-types')
  @RequirePermissions('maintenance.view')
  @ApiOperation({ summary: 'System maintenance categories with usage counts' })
  async list() {
    const types = await this.prisma.serviceType.findMany({
      where: { ownerUserId: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { schedules: true, records: true } } },
    });
    return types.map((t) => ({
      ...serviceTypeView(t),
      sortOrder: t.sortOrder,
      scheduleCount: t._count.schedules,
      recordCount: t._count.records,
    }));
  }

  @Post('service-types')
  @RequirePermissions('maintenance.manage')
  @ApiOperation({ summary: 'Create a system maintenance category' })
  async create(
    @CurrentAdmin() admin: AuthAdmin,
    @Body() dto: AdminServiceTypeDto,
    @Req() req: Request,
  ) {
    const exists = await this.prisma.serviceType.findFirst({
      where: { ownerUserId: null, code: dto.code },
    });
    if (exists) throw AppException.conflict('A category with this code already exists');
    const t = await this.prisma.serviceType.create({
      data: {
        code: dto.code,
        nameUz: dto.nameUz,
        nameRu: dto.nameRu,
        nameEn: dto.nameEn,
        suggestedIntervalDays: dto.suggestedIntervalDays ?? null,
        suggestedIntervalKm: dto.suggestedIntervalKm ?? null,
        icon: dto.icon ?? 'wrench',
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 100,
      },
    });
    await this.audit.log({
      adminId: admin.id,
      action: 'maintenance.service_type_create',
      entityType: 'service_type',
      entityId: t.id,
      metadata: { code: t.code },
      req,
    });
    return serviceTypeView(t);
  }

  @Put('service-types/:id')
  @RequirePermissions('maintenance.manage')
  @ApiOperation({ summary: 'Update a system category (names, suggested intervals, active)' })
  async update(
    @CurrentAdmin() admin: AuthAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminServiceTypeDto,
    @Req() req: Request,
  ) {
    const t = await this.prisma.serviceType.findFirst({ where: { id, ownerUserId: null } });
    if (!t) throw AppException.notFound('Service type');
    if (dto.code !== t.code) throw AppException.validation('The category code cannot be changed');
    const updated = await this.prisma.serviceType.update({
      where: { id },
      data: {
        nameUz: dto.nameUz,
        nameRu: dto.nameRu,
        nameEn: dto.nameEn,
        suggestedIntervalDays: dto.suggestedIntervalDays ?? null,
        suggestedIntervalKm: dto.suggestedIntervalKm ?? null,
        icon: dto.icon ?? t.icon,
        isActive: dto.isActive ?? t.isActive,
        sortOrder: dto.sortOrder ?? t.sortOrder,
      },
    });
    await this.audit.log({
      adminId: admin.id,
      action: 'maintenance.service_type_update',
      entityType: 'service_type',
      entityId: id,
      metadata: {
        before: { days: t.suggestedIntervalDays, km: t.suggestedIntervalKm, active: t.isActive },
        after: {
          days: updated.suggestedIntervalDays,
          km: updated.suggestedIntervalKm,
          active: updated.isActive,
        },
      },
      req,
    });
    return serviceTypeView(updated);
  }

  @Delete('service-types/:id')
  @HttpCode(204)
  @RequirePermissions('maintenance.manage')
  @ApiOperation({
    summary: 'Delete an unused system category (deactivate it instead if it is in use)',
  })
  async remove(
    @CurrentAdmin() admin: AuthAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    const t = await this.prisma.serviceType.findFirst({
      where: { id, ownerUserId: null },
      include: { _count: { select: { schedules: true, records: true } } },
    });
    if (!t) throw AppException.notFound('Service type');
    if (t._count.schedules || t._count.records)
      throw AppException.conflict('Category is in use — deactivate it instead');
    await this.prisma.serviceType.delete({ where: { id } });
    await this.audit.log({
      adminId: admin.id,
      action: 'maintenance.service_type_delete',
      entityType: 'service_type',
      entityId: id,
      metadata: { code: t.code },
      req,
    });
  }

  @Get('stats')
  @RequirePermissions('maintenance.view')
  @ApiOperation({ summary: 'Maintenance statistics' })
  async stats() {
    const [byType, schedules, totalCost] = await Promise.all([
      this.prisma.$queryRaw<
        { code: string; name: string; records: bigint; cost: Prisma.Decimal | null }[]
      >`
        SELECT st.code, st.name_en AS name, COUNT(r.id) AS records, SUM(r.cost) AS cost
        FROM service_types st JOIN maintenance_records r ON r.service_type_id = st.id
        GROUP BY st.code, st.name_en ORDER BY records DESC LIMIT 20`,
      this.prisma.$queryRaw<{ overdue: bigint; due_soon: bigint; total: bigint }[]>`
        SELECT
          COUNT(*) FILTER (WHERE next_due_date < (now() AT TIME ZONE 'Asia/Tashkent')::date) AS overdue,
          COUNT(*) FILTER (WHERE next_due_date BETWEEN (now() AT TIME ZONE 'Asia/Tashkent')::date AND (now() AT TIME ZONE 'Asia/Tashkent')::date + 14) AS due_soon,
          COUNT(*) AS total
        FROM maintenance_schedules WHERE is_active`,
      this.prisma.maintenanceRecord.aggregate({ _sum: { cost: true }, _avg: { cost: true } }),
    ]);
    const s = schedules[0];
    return {
      recordsByType: byType.map((b) => ({
        code: b.code,
        name: b.name,
        records: Number(b.records),
        totalCost: b.cost ? new Prisma.Decimal(b.cost).toFixed(2) : '0.00',
      })),
      schedules: {
        total: Number(s?.total ?? 0),
        overdueByDate: Number(s?.overdue ?? 0),
        dueSoonByDate: Number(s?.due_soon ?? 0),
      },
      totalServiceCost: (totalCost._sum.cost ?? new Prisma.Decimal(0)).toFixed(2),
      averageServiceCost: (totalCost._avg.cost ?? new Prisma.Decimal(0)).toFixed(2),
    };
  }
}
