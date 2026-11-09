import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { NotificationType, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { maskPhone } from '@moshina/shared';
import {
  CurrentAdmin,
  Public,
  RequirePermissions,
  type AuthAdmin,
} from '../../common/decorators/auth.decorators';
import { AppException } from '../../common/errors/app-exception';
import { paginate, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AnnouncementsService, announcementView } from '../../notifications/announcements.service';
import { ReminderEngineService } from '../../notifications/reminder-engine.service';
import { TEMPLATE_PLACEHOLDERS, TemplatesService } from '../../notifications/templates.service';
import { AdminGuard } from '../admin.guard';
import { AuditService } from '../audit.service';
import {
  AdminNotificationQueryDto,
  CreateAnnouncementDto,
  UpdateTemplateDto,
} from '../dto/admin.dto';

@ApiTags('Admin · Notifications')
@ApiBearerAuth()
@Public()
@UseGuards(AdminGuard)
@Controller({ path: 'admin/notifications', version: '1' })
export class AdminNotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplatesService,
    private readonly announcements: AnnouncementsService,
    private readonly reminders: ReminderEngineService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('notifications.view')
  @ApiOperation({ summary: 'Notification history with delivery status' })
  async list(@CurrentAdmin() admin: AuthAdmin, @Query() q: AdminNotificationQueryDto) {
    const pii = admin.permissions.has('users.view_pii');
    const where: Prisma.NotificationWhereInput = {
      type: q.type,
      pushStatus: q.status,
      userId: q.userId,
    };
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { phone: true } },
          deliveries: { select: { status: true, error: true, sentAt: true } },
        },
        ...paginate(q),
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      items: rows.map((n) => ({
        id: n.id,
        userId: n.userId,
        userPhone: pii ? n.user.phone : maskPhone(n.user.phone),
        type: n.type,
        title: n.title,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() ?? null,
        deliveryStatus: n.pushStatus,
        deliveries: n.deliveries.map((d) => ({
          status: d.status,
          error: d.error,
          sentAt: d.sentAt?.toISOString() ?? null,
        })),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  @Get('templates')
  @RequirePermissions('notifications.view')
  @ApiOperation({ summary: 'Notification templates' })
  async listTemplates() {
    const rows = await this.prisma.notificationTemplate.findMany({ orderBy: { code: 'asc' } });
    return rows.map((t) => ({
      id: t.id,
      code: t.code,
      title: { uz: t.titleUz, ru: t.titleRu, en: t.titleEn },
      body: { uz: t.bodyUz, ru: t.bodyRu, en: t.bodyEn },
      placeholders: TEMPLATE_PLACEHOLDERS[t.code],
      isActive: t.isActive,
      updatedAt: t.updatedAt.toISOString(),
    }));
  }

  @Put('templates/:code')
  @RequirePermissions('notifications.manage')
  @ApiOperation({ summary: 'Update a notification template' })
  async updateTemplate(
    @CurrentAdmin() admin: AuthAdmin,
    @Param('code') code: string,
    @Body() dto: UpdateTemplateDto,
    @Req() req: Request,
  ) {
    if (!(code in TEMPLATE_PLACEHOLDERS) || code === 'ANNOUNCEMENT')
      throw AppException.notFound('Template');
    const lengths =
      [dto.title.uz, dto.title.ru, dto.title.en].every((s) => s.length <= 120) &&
      [dto.body.uz, dto.body.ru, dto.body.en].every((s) => s.length <= 500);
    if (!lengths) throw AppException.validation('Titles max 120 and bodies max 500 characters');
    const t = await this.prisma.notificationTemplate.update({
      where: { code: code as NotificationType },
      data: {
        titleUz: dto.title.uz,
        titleRu: dto.title.ru,
        titleEn: dto.title.en,
        bodyUz: dto.body.uz,
        bodyRu: dto.body.ru,
        bodyEn: dto.body.en,
        isActive: dto.isActive,
      },
    });
    this.templates.invalidate();
    await this.audit.log({
      adminId: admin.id,
      action: 'notifications.template_update',
      entityType: 'notification_template',
      entityId: code,
      metadata: { isActive: dto.isActive },
      req,
    });
    return { id: t.id, code: t.code, isActive: t.isActive, updatedAt: t.updatedAt.toISOString() };
  }

  @Get('announcements')
  @RequirePermissions('notifications.view')
  @ApiOperation({ summary: 'System announcements (scheduled and sent)' })
  listAnnouncements(@Query() q: PaginationQueryDto) {
    return this.announcements.list(q);
  }

  @Post('announcements')
  @RequirePermissions('notifications.manage')
  @ApiOperation({ summary: 'Create a system announcement (send now or schedule)' })
  async createAnnouncement(
    @CurrentAdmin() admin: AuthAdmin,
    @Body() dto: CreateAnnouncementDto,
    @Req() req: Request,
  ) {
    const a = await this.announcements.create(admin.id, {
      title: dto.title,
      body: dto.body,
      targetLanguage: dto.targetLanguage ?? null,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
    });
    await this.audit.log({
      adminId: admin.id,
      action: 'notifications.announcement_create',
      entityType: 'announcement',
      entityId: a.id,
      metadata: { scheduledAt: a.scheduledAt.toISOString(), targetLanguage: a.targetLanguage },
      req,
    });
    return announcementView(a);
  }

  @Post('announcements/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('notifications.manage')
  @ApiOperation({ summary: 'Cancel a scheduled announcement' })
  async cancel(
    @CurrentAdmin() admin: AuthAdmin,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const a = await this.announcements.cancel(id);
    await this.audit.log({
      adminId: admin.id,
      action: 'notifications.announcement_cancel',
      entityType: 'announcement',
      entityId: id,
      req,
    });
    return announcementView(a);
  }

  @Get('scheduled')
  @RequirePermissions('notifications.view')
  @ApiOperation({ summary: 'Upcoming scheduled work: announcements and reminder engine schedule' })
  async scheduled() {
    const pending = await this.prisma.announcement.findMany({
      where: { status: 'SCHEDULED' },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
    });
    return {
      reminderEngine: {
        cron: 'Hourly at minute 5 (within the configured send window, Asia/Tashkent)',
      },
      receiptChecks: { cron: 'Every 10 minutes' },
      announcements: pending.map((a) => announcementView(a)),
    };
  }

  @Post('reminders/run')
  @HttpCode(200)
  @RequirePermissions('notifications.manage')
  @ApiOperation({ summary: 'Run the reminder engine now (deduplicated; never sends duplicates)' })
  async runReminders(@CurrentAdmin() admin: AuthAdmin, @Req() req: Request) {
    const result = await this.reminders.run(new Date(), { ignoreSendWindow: true });
    await this.audit.log({
      adminId: admin.id,
      action: 'notifications.reminders_run',
      metadata: { ...result },
      req,
    });
    return result;
  }
}
