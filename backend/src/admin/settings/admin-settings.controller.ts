import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { LANGUAGES } from '@moshina/shared';
import { CurrentAdmin, Public, RequirePermissions, type AuthAdmin } from '../../common/decorators/auth.decorators';
import { SystemSettingsService } from '../../settings/system-settings.service';
import { HealthService } from '../../health/health.service';
import { AdminGuard } from '../admin.guard';
import { AuditService } from '../audit.service';
import { UpdateSettingDto } from '../dto/admin.dto';

@ApiTags('Admin · Settings')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@Controller({ path: 'admin/settings', version: '1' })
export class AdminSettingsController {
  constructor(
    private readonly settings: SystemSettingsService,
    private readonly health: HealthService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'System settings (reminder thresholds, defaults, support contacts)' })
  async list() {
    return { settings: await this.settings.list(), languages: LANGUAGES };
  }

  @Put(':key')
  @RequirePermissions('settings.manage')
  @ApiOperation({ summary: 'Change a system setting' })
  async update(@CurrentAdmin() admin: AuthAdmin, @Param('key') key: string, @Body() dto: UpdateSettingDto, @Req() req: Request) {
    const r = await this.settings.set(key, dto.value, admin.id);
    await this.audit.log({ adminId: admin.id, action: 'settings.update', entityType: 'setting', entityId: key, metadata: { previous: r.previous, value: r.value }, req });
    return r;
  }

  @Get('health')
  @RequirePermissions('settings.view')
  @ApiOperation({ summary: 'System health: database, Redis, SMS provider, push, queues, storage' })
  healthStatus() {
    return this.health.full();
  }
}
