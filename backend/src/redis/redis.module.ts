import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis, { type RedisOptions } from 'ioredis';
import { APP_ENV } from '../config/config.module';
import type { Env } from '../config/env';

export const REDIS = Symbol('REDIS');

/** Creates Redis connections that are closed when the application shuts down. */
@Injectable()
export class RedisFactory implements OnApplicationShutdown {
  private readonly connections: Redis[] = [];

  constructor(@Inject(APP_ENV) private readonly env: Env) {}

  create(options: RedisOptions = {}): Redis {
    const conn = new Redis(this.env.REDIS_URL, { enableReadyCheck: true, ...options });
    this.connections.push(conn);
    return conn;
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(this.connections.map((c) => c.quit().catch(() => c.disconnect())));
  }
}

@Global()
@Module({
  providers: [
    RedisFactory,
    { provide: REDIS, inject: [RedisFactory], useFactory: (f: RedisFactory) => f.create({ maxRetriesPerRequest: 3 }) },
  ],
  exports: [REDIS, RedisFactory],
})
export class RedisModule {}
