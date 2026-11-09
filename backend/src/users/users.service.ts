import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Language as PrismaLanguage, User, UserSettings } from '@prisma/client';
import type { Language } from '@moshina/shared';
import { APP_ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { FilesService } from '../files/files.service';
import { TokenService } from '../auth/token.service';
import type { UpdateProfileDto, UpdateSettingsDto } from './dto/users.dto';

export interface UserProfileView {
  id: string;
  phone: string;
  fullName: string | null;
  avatarUrl: string | null;
  status: User['status'];
  createdAt: string;
  deletionRequestedAt: string | null;
  deletionScheduledFor: string | null;
  settings: {
    language: Language;
    pushEnabled: boolean;
    maintenanceReminders: boolean;
    mileageReminders: boolean;
    announcements: boolean;
    primaryVehicleId: string | null;
  };
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly tokens: TokenService,
  ) {}

  toView(user: User & { settings: UserSettings | null }): UserProfileView {
    const s = user.settings;
    return {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      avatarUrl: this.files.url(user.avatarFileId),
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
      deletionScheduledFor: user.deletionScheduledAt?.toISOString() ?? null,
      settings: {
        language: (s?.language ?? 'uz') as Language,
        pushEnabled: s?.pushEnabled ?? true,
        maintenanceReminders: s?.maintenanceReminders ?? true,
        mileageReminders: s?.mileageReminders ?? true,
        announcements: s?.announcements ?? true,
        primaryVehicleId: s?.primaryVehicleId ?? null,
      },
    };
  }

  async findOrCreateByPhone(
    phone: string,
    language: Language,
  ): Promise<{ user: User & { settings: UserSettings | null }; isNew: boolean }> {
    const existing = await this.prisma.user.findUnique({
      where: { phone },
      include: { settings: true },
    });
    if (existing) return { user: existing, isNew: false };
    try {
      const created = await this.prisma.user.create({
        data: { phone, settings: { create: { language: language as PrismaLanguage } } },
        include: { settings: true },
      });
      return { user: created, isNew: true };
    } catch (err) {
      // Parallel verification for the same phone: fall back to the row created by the other request.
      const again = await this.prisma.user.findUnique({
        where: { phone },
        include: { settings: true },
      });
      if (again) return { user: again, isNew: false };
      throw err;
    }
  }

  async getProfile(userId: string): Promise<UserProfileView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { settings: true },
    });
    if (!user) throw AppException.notFound('User');
    return this.toView(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfileView> {
    await this.prisma.user.update({ where: { id: userId }, data: { fullName: dto.fullName } });
    return this.getProfile(userId);
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto): Promise<UserProfileView> {
    await this.prisma.userSettings.upsert({
      where: { userId },
      create: { userId, ...dto, language: (dto.language ?? 'uz') as PrismaLanguage },
      update: { ...dto, language: dto.language as PrismaLanguage | undefined },
    });
    return this.getProfile(userId);
  }

  async setAvatar(
    userId: string,
    upload: Express.Multer.File | undefined,
  ): Promise<UserProfileView> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const file = await this.files.storeImage(userId, 'AVATAR', upload);
    await this.prisma.user.update({ where: { id: userId }, data: { avatarFileId: file.id } });
    if (user.avatarFileId) await this.files.deleteFile(user.avatarFileId);
    return this.getProfile(userId);
  }

  async removeAvatar(userId: string): Promise<UserProfileView> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.avatarFileId) {
      await this.prisma.user.update({ where: { id: userId }, data: { avatarFileId: null } });
      await this.files.deleteFile(user.avatarFileId);
    }
    return this.getProfile(userId);
  }

  async requestDeletion(userId: string, now = new Date()): Promise<UserProfileView> {
    const scheduled = new Date(now.getTime() + this.env.ACCOUNT_DELETION_GRACE_DAYS * 86_400_000);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'DELETION_PENDING',
        deletionRequestedAt: now,
        deletionScheduledAt: scheduled,
      },
    });
    // Stop reminders immediately.
    await this.prisma.pushDevice.updateMany({
      where: { userId, disabledAt: null },
      data: { disabledAt: now },
    });
    return this.getProfile(userId);
  }

  async cancelDeletion(userId: string): Promise<UserProfileView> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.status !== 'DELETION_PENDING')
      throw AppException.conflict('No pending deletion request');
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', deletionRequestedAt: null, deletionScheduledAt: null },
    });
    return this.getProfile(userId);
  }

  /** Permanently deletes accounts whose grace period has ended. Returns the number of purged accounts. */
  async purgeDueDeletions(now = new Date()): Promise<number> {
    const due = await this.prisma.user.findMany({
      where: { status: 'DELETION_PENDING', deletionScheduledAt: { lte: now } },
      select: { id: true },
      take: 100,
    });
    let purged = 0;
    for (const { id } of due) {
      const files = await this.prisma.storedFile.findMany({
        where: { ownerUserId: id },
        select: { storageKey: true },
      });
      await this.tokens.revokeAllForUser(id, 'deleted');
      // Cascading foreign keys remove vehicles, schedules, records, expenses, notifications, devices and files.
      await this.prisma.user.delete({ where: { id } });
      await this.files.removeBlobs(files.map((f) => f.storageKey));
      purged += 1;
    }
    if (purged > 0) this.logger.log(`Purged ${purged} account(s) after deletion grace period`);
    return purged;
  }
}
