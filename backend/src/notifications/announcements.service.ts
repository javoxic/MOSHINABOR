import { Injectable, Logger } from '@nestjs/common';
import type { Announcement, Language as PrismaLanguage, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { paginate } from '../common/dto/pagination.dto';
import { NotificationsService } from './notifications.service';

export interface AnnouncementInput {
  title: { uz: string; ru: string; en: string };
  body: { uz: string; ru: string; en: string };
  targetLanguage?: PrismaLanguage | null;
  scheduledAt?: Date;
}

export function announcementView(a: Announcement & { createdBy?: { email: string } | null }) {
  return {
    id: a.id,
    title: { uz: a.titleUz, ru: a.titleRu, en: a.titleEn },
    body: { uz: a.bodyUz, ru: a.bodyRu, en: a.bodyEn },
    targetLanguage: a.targetLanguage,
    status: a.status,
    scheduledAt: a.scheduledAt.toISOString(),
    sentAt: a.sentAt?.toISOString() ?? null,
    recipientCount: a.recipientCount,
    createdBy: a.createdBy?.email ?? '—',
    createdAt: a.createdAt.toISOString(),
  };
}

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(adminId: string, input: AnnouncementInput): Promise<Announcement> {
    const scheduledAt = input.scheduledAt ?? new Date();
    if (scheduledAt.getTime() < Date.now() - 60_000) throw AppException.validation('scheduledAt must be in the future');
    return this.prisma.announcement.create({
      data: {
        titleUz: input.title.uz,
        titleRu: input.title.ru,
        titleEn: input.title.en,
        bodyUz: input.body.uz,
        bodyRu: input.body.ru,
        bodyEn: input.body.en,
        targetLanguage: input.targetLanguage ?? null,
        scheduledAt,
        createdById: adminId,
      },
    });
  }

  async list(q: { page: number; pageSize: number }) {
    const [items, total] = await Promise.all([
      this.prisma.announcement.findMany({ orderBy: { scheduledAt: 'desc' }, include: { createdBy: { select: { email: true } } }, ...paginate(q) }),
      this.prisma.announcement.count(),
    ]);
    return { items: items.map(announcementView), total, page: q.page, pageSize: q.pageSize };
  }

  async cancel(id: string): Promise<Announcement> {
    const r = await this.prisma.announcement.updateMany({ where: { id, status: 'SCHEDULED' }, data: { status: 'CANCELLED' } });
    if (r.count === 0) throw AppException.conflict('Only scheduled announcements can be cancelled');
    return this.prisma.announcement.findUniqueOrThrow({ where: { id } });
  }

  /** Delivers announcements whose scheduled time has come. Safe to run concurrently. */
  async dispatchDue(now = new Date()): Promise<number> {
    const due = await this.prisma.announcement.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: now } }, take: 5 });
    let dispatched = 0;
    for (const a of due) {
      const claimed = await this.prisma.announcement.updateMany({ where: { id: a.id, status: 'SCHEDULED' }, data: { status: 'SENDING' } });
      if (claimed.count === 0) continue;
      try {
        const count = await this.deliver(a);
        await this.prisma.announcement.update({ where: { id: a.id }, data: { status: 'SENT', sentAt: new Date(), recipientCount: count } });
        dispatched += 1;
      } catch (err) {
        this.logger.error(`Announcement ${a.id} failed: ${(err as Error).message}`);
        await this.prisma.announcement.update({ where: { id: a.id }, data: { status: 'FAILED' } });
      }
    }
    return dispatched;
  }

  private async deliver(a: Announcement): Promise<number> {
    let cursor: string | undefined;
    let count = 0;
    const where: Prisma.UserWhereInput = {
      status: 'ACTIVE',
      settings: { is: { announcements: true, ...(a.targetLanguage ? { language: a.targetLanguage } : {}) } },
    };
    for (;;) {
      const users = await this.prisma.user.findMany({
        where,
        select: { id: true, settings: { select: { language: true } } },
        orderBy: { id: 'asc' },
        take: 500,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (users.length === 0) break;
      cursor = users[users.length - 1]?.id;
      for (const u of users) {
        const lang = u.settings?.language ?? 'uz';
        const created = await this.notifications.create({
          userId: u.id,
          type: 'ANNOUNCEMENT',
          title: lang === 'ru' ? a.titleRu : lang === 'en' ? a.titleEn : a.titleUz,
          body: lang === 'ru' ? a.bodyRu : lang === 'en' ? a.bodyEn : a.bodyUz,
          data: { announcementId: a.id },
          dedupeKey: `ann:${a.id}`,
          announcementId: a.id,
        });
        if (created) count += 1;
      }
      if (users.length < 500) break;
    }
    return count;
  }
}
