import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Prisma, type Notification, type NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { paginate } from '../common/dto/pagination.dto';
import { PUSH_QUEUE, type PushJobData } from './notifications.constants';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  dedupeKey?: string;
  announcementId?: string;
}

export function notificationView(n: Notification) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: (n.data as Record<string, string> | null) ?? null,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(PUSH_QUEUE) private readonly pushQueue: Queue<PushJobData>,
  ) {}

  /**
   * Creates an in-app notification and queues push delivery. Returns null when a notification with
   * the same dedupe key already exists for the user (duplicate suppressed by a unique index).
   */
  async create(input: CreateNotificationInput): Promise<Notification | null> {
    let n: Notification;
    try {
      n = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title.slice(0, 200),
          body: input.body.slice(0, 1200),
          data: input.data ?? Prisma.JsonNull,
          dedupeKey: input.dedupeKey ?? null,
          announcementId: input.announcementId ?? null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
      throw err;
    }
    await this.enqueuePush(n.id);
    return n;
  }

  async enqueuePush(notificationId: string): Promise<void> {
    await this.pushQueue.add(
      'send',
      { notificationId },
      {
        jobId: `push-${notificationId}`,
        attempts: 4,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
  }

  async list(userId: string, q: { page: number; pageSize: number; unreadOnly?: boolean }) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      readAt: q.unreadOnly ? null : undefined,
    };
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q) }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      items: items.map(notificationView),
      total,
      page: q.page,
      pageSize: q.pageSize,
      unread,
    };
  }

  async markRead(userId: string, id: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!n) throw AppException.notFound('Notification');
    const updated = n.readAt
      ? n
      : await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    return notificationView(updated);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const r = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: r.count };
  }

  async remove(userId: string, id: string): Promise<void> {
    const r = await this.prisma.notification.deleteMany({ where: { id, userId } });
    if (r.count === 0) throw AppException.notFound('Notification');
  }
}
