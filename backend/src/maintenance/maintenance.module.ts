import { Module } from '@nestjs/common';
import { ServiceTypesModule } from '../service-types/service-types.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { RecordsController, SchedulesController } from './maintenance.controller';
import { RecordsService } from './records.service';
import { SchedulesService } from './schedules.service';

@Module({
  imports: [VehiclesModule, ServiceTypesModule],
  controllers: [SchedulesController, RecordsController],
  providers: [SchedulesService, RecordsService],
  exports: [SchedulesService, RecordsService],
})
export class MaintenanceModule {}
