import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ParseUUIDPipe } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/decorators/auth.decorators';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller({ path: 'dashboard', version: '1' })
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Home screen data for the selected (or primary) vehicle' })
  @ApiQuery({ name: 'vehicleId', required: false })
  get(@CurrentUser() user: AuthUser, @Query('vehicleId', new ParseUUIDPipe({ optional: true })) vehicleId?: string) {
    return this.dashboard.get(user.id, vehicleId);
  }
}
