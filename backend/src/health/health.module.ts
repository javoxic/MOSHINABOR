import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { HealthController } from './health.controller';
import { AppConfigController } from '../app-config/app-config.controller';
import { HealthService } from './health.service';

@Module({
  imports: [NotificationsModule],
  controllers: [HealthController, AppConfigController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
