import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { REDIS } from '../redis/redis.module';
import { PrismaService } from '../prisma/prisma.service';
import { ReminderEngineService } from '../notifications/reminder-engine.service';
import { PushService } from '../notifications/push.service';
import { AnnouncementsService } from '../notifications/announcements.service';
import { UsersService } from '../users/users.service';

/**
 * Periodic jobs. Each run takes a Redis lock so that only one worker instance executes it,
 * even when several workers are deployed.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly reminders: ReminderEngineService,
    private readonly push: PushService,
    private readonly announcements: AnnouncementsService,
    private readonly users: UsersService,
  ) {}

  private async withLock(name: string, ttlSeconds: number, fn: () => Promise<unknown>): Promise<void> {
    const key = `lock:job:${name}`;
    const token = randomUUID();
    const ok = await this.redis.set(key, token, 'EX', ttlSeconds, 'NX');
    if (!ok) return;
    try {
      await fn();
    } catch (err) {
      this.logger.error({ job: name, error: (err as Error).message, stack: (err as Error).stack }, 'Scheduled job failed');
    } finally {
      // Release only our own lock.
      await this.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        key,
        token,
      );
    }
  }

  @Cron('5 * * * *', { name: 'reminders' })
  runReminders(): Promise<void> {
    return this.withLock('reminders', 50 * 60, () => this.reminders.run());
  }

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'push-receipts' })
  runReceipts(): Promise<void> {
    return this.withLock('push-receipts', 9 * 60, () => this.push.checkReceipts());
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'announcements' })
  runAnnouncements(): Promise<void> {
    return this.withLock('announcements', 55, () => this.announcements.dispatchDue());
  }

  @Cron('30 3 * * *', { name: 'account-purge', timeZone: 'Asia/Tashkent' })
  runAccountPurge(): Promise<void> {
    return this.withLock('account-purge', 3600, () => this.users.purgeDueDeletions());
  }

  @Cron('0 4 * * *', { name: 'cleanup', timeZone: 'Asia/Tashkent' })
  runCleanup(): Promise<void> {
    return this.withLock('cleanup', 3600, async () => {
      const now = Date.now();
      const otp = await this.prisma.smsVerification.deleteMany({ where: { createdAt: { lt: new Date(now - 30 * 86_400_000) } } });
      const tokens = await this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date(now - 7 * 86_400_000) } } });
      const adminSessions = await this.prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date(now - 7 * 86_400_000) } } });
      const smsEvents = await this.prisma.smsProviderEvent.deleteMany({ where: { createdAt: { lt: new Date(now - 90 * 86_400_000) } } });
      this.logger.log(`Cleanup: ${otp.count} OTP rows, ${tokens.count} refresh tokens, ${adminSessions.count} admin sessions, ${smsEvents.count} SMS events`);
    });
  }
}
