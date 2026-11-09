import { Module } from '@nestjs/common';
import { ExpensesModule } from '../expenses/expenses.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({ imports: [VehiclesModule, MaintenanceModule, ExpensesModule], controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
