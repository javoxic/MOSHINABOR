import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushProcessor } from '../notifications/push.processor';
import { UsersModule } from '../users/users.module';
import { JobsService } from './jobs.service';

/** Loaded only in processes with PROCESS_ROLE=worker|all. */
@Module({
  imports: [ScheduleModule.forRoot(), NotificationsModule, UsersModule],
  providers: [JobsService, PushProcessor],
})
export class JobsModule {}
