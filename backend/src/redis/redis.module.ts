import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_ENV } from '../config/config.module';
import type { Env } from '../config/env';

export const REDIS = Symbol('REDIS');

@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}
  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [APP_ENV],
      useFactory: (env: Env) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, enableReadyCheck: true, lazyConnect: false }),
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
