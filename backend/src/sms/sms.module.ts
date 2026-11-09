import { Global, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { REDIS } from '../redis/redis.module';
import { EskizSmsProvider } from './providers/eskiz.provider';
import { LogSmsProvider } from './providers/log.provider';
import { TwilioSmsProvider } from './providers/twilio.provider';
import type { SmsProvider } from './sms-provider.interface';
import { SMS_INTERNATIONAL_PROVIDER, SMS_PRIMARY_PROVIDER, SmsService } from './sms.service';
import { SmsWebhookController } from './sms-webhook.controller';

@Global()
@Module({
  controllers: [SmsWebhookController],
  providers: [
    {
      provide: SMS_PRIMARY_PROVIDER,
      inject: [APP_ENV, REDIS],
      useFactory: (env: Env, redis: Redis): SmsProvider => {
        switch (env.SMS_PROVIDER) {
          case 'eskiz':
            return new EskizSmsProvider(env, redis);
          case 'twilio':
            return new TwilioSmsProvider(env);
          case 'log':
            return new LogSmsProvider(env.NODE_ENV);
        }
      },
    },
    {
      provide: SMS_INTERNATIONAL_PROVIDER,
      inject: [APP_ENV],
      useFactory: (env: Env): SmsProvider | null =>
        env.SMS_INTERNATIONAL_PROVIDER === 'twilio' ? new TwilioSmsProvider(env) : null,
    },
    SmsService,
  ],
  exports: [SmsService],
})
export class SmsModule {}
