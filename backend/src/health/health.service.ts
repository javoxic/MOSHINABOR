import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { APP_ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { SmsService } from '../sms/sms.service';
import { StorageService } from '../files/storage.service';
import { PUSH_QUEUE } from '../notifications/notifications.constants';

const VERSION = process.env.APP_VERSION ?? '1.0.0';

@Injectable()
export class HealthService {
  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly storage: StorageService,
    @InjectQueue(PUSH_QUEUE) private readonly pushQueue: Queue,
  ) {}

  async database() {
    const start = Date.now();
    try {
      const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
      return { ok: true, latencyMs: Date.now() - start, migrations: Number(rows[0]?.count ?? 0) };
    } catch (err) {
      return { ok: false, latencyMs: null, migrations: null, error: (err as Error).message.slice(0, 200) };
    }
  }

  async redisStatus() {
    const start = Date.now();
    try {
      await this.redis.ping();
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, latencyMs: null, error: (err as Error).message.slice(0, 200) };
    }
  }

  async readiness(): Promise<{ ok: boolean; database: boolean; redis: boolean }> {
    const [db, redis] = await Promise.all([this.database(), this.redisStatus()]);
    return { ok: db.ok && redis.ok, database: db.ok, redis: redis.ok };
  }

  async full() {
    const [database, redis, sms, counts, writable] = await Promise.all([
      this.database(),
      this.redisStatus(),
      this.sms.status(),
      this.pushQueue.getJobCounts('waiting', 'active', 'failed', 'delayed').catch(() => null),
      this.storage.isWritable(),
    ]);
    const degraded = !database.ok || !redis.ok || !sms.configured || !writable;
    return {
      status: degraded ? ('degraded' as const) : ('ok' as const),
      version: VERSION,
      environment: this.env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      database,
      redis,
      sms,
      push: { provider: 'expo' as const, accessTokenConfigured: Boolean(this.env.EXPO_ACCESS_TOKEN) },
      queues: counts
        ? [{ name: PUSH_QUEUE, waiting: counts.waiting ?? 0, active: counts.active ?? 0, failed: counts.failed ?? 0, delayed: counts.delayed ?? 0 }]
        : [],
      storage: { driver: 'local', writable },
    };
  }
}
