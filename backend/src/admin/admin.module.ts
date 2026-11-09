import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminAdminsController } from './admins/admin-admins.controller';
import { AdminGuard } from './admin.guard';
import { AuditService } from './audit.service';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminMaintenanceController } from './maintenance/admin-maintenance.controller';
import { AdminNotificationsController } from './notifications/admin-notifications.controller';
import { AdminSettingsController } from './settings/admin-settings.controller';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersService } from './users/admin-users.service';
import { AdminVehiclesController } from './vehicles/admin-vehicles.controller';

@Module({
  imports: [NotificationsModule, HealthModule],
  controllers: [
    AdminAuthController,
    AdminDashboardController,
    AdminUsersController,
    AdminVehiclesController,
    AdminMaintenanceController,
    AdminNotificationsController,
    AdminAdminsController,
    AdminSettingsController,
  ],
  providers: [AdminGuard, AuditService, AdminAuthService, AdminUsersService],
})
export class AdminModule {}
