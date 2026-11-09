import { DynamicModule, Module, type Type } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { LoggerModule } from 'nestjs-pino';
import type { Env } from './config/env';
import { APP_ENV, AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisFactory, RedisModule } from './redis/redis.module';
import { SettingsModule } from './settings/settings.module';
import { SmsModule } from './sms/sms.module';
import { TokenModule } from './auth/token.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FilesModule } from './files/files.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { ServiceTypesModule } from './service-types/service-types.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { ExpensesModule } from './expenses/expenses.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthModule } from './health/health.module';
import { AdminModule } from './admin/admin.module';
import { JobsModule } from './jobs/jobs.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';

@Module({})
export class AppModule {
  static register(env: Env, opts: { withJobs?: boolean; withHttp?: boolean } = {}): DynamicModule {
    const withHttp = opts.withHttp ?? env.PROCESS_ROLE !== 'worker';
    const withJobs = opts.withJobs ?? env.PROCESS_ROLE !== 'api';

    const imports: (Type | DynamicModule)[] = [
      AppConfigModule,
      LoggerModule.forRoot({
        pinoHttp: {
          level: env.LOG_LEVEL,
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          // Never log credentials, cookies, tokens or verification codes.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              'req.query.secret',
              '*.code',
              '*.password',
              '*.refreshToken',
              '*.accessToken',
            ],
            censor: '[REDACTED]',
          },
          serializers: {
            req: (req: { id: string; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url.replace(/secret=[^&]+/, 'secret=[REDACTED]'),
            }),
          },
          autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/v1/health') },
          customProps: () => ({ service: 'moshina-bor-api' }),
        },
      }),
      PrismaModule,
      RedisModule,
      SettingsModule,
      BullModule.forRootAsync({
        inject: [RedisFactory],
        useFactory: (f: RedisFactory) => ({ connection: f.create({ maxRetriesPerRequest: null }) }),
      }),
      ThrottlerModule.forRootAsync({
        inject: [RedisFactory, APP_ENV],
        useFactory: (f: RedisFactory, e: Env) => ({
          throttlers: [{ name: 'default', ttl: 60_000, limit: e.RATE_LIMIT_PER_MINUTE }],
          storage: new ThrottlerStorageRedisService(f.create()),
        }),
      }),
      TokenModule,
      SmsModule,
      FilesModule,
      NotificationsModule,
    ];

    if (withHttp) {
      imports.push(
        AuthModule,
        UsersModule,
        VehiclesModule,
        ServiceTypesModule,
        MaintenanceModule,
        ExpensesModule,
        DashboardModule,
        HealthModule,
        AdminModule,
      );
    }
    if (withJobs) imports.push(JobsModule);

    return {
      module: AppModule,
      imports,
      providers: withHttp
        ? [
            { provide: APP_GUARD, useClass: UserThrottlerGuard },
            { provide: APP_GUARD, useClass: JwtAuthGuard },
            { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
          ]
        : [],
    };
  }
}
