import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { Expo } from 'expo-server-sdk';
import { APP_ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { AnnouncementsService } from './announcements.service';
import { EXPO_CLIENT, PUSH_QUEUE } from './notifications.constants';
import { NotificationsController, PushDevicesController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { ReminderEngineService } from './reminder-engine.service';
import { TemplatesService } from './templates.service';

@Module({
  imports: [BullModule.registerQueue({ name: PUSH_QUEUE })],
  controllers: [NotificationsController, PushDevicesController],
  providers: [
    { provide: EXPO_CLIENT, inject: [APP_ENV], useFactory: (env: Env) => new Expo({ accessToken: env.EXPO_ACCESS_TOKEN || undefined }) },
    NotificationsService,
    PushService,
    TemplatesService,
    ReminderEngineService,
    AnnouncementsService,
  ],
  exports: [NotificationsService, PushService, TemplatesService, ReminderEngineService, AnnouncementsService, BullModule],
})
export class NotificationsModule {}
