import { Injectable } from '@nestjs/common';
import {
  DEFAULT_SYSTEM_SETTINGS,
  type ReminderThresholds,
  type SystemSettingKey,
} from '@moshina/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';

type SettingValue = string | number | boolean;

@Injectable()
export class SystemSettingsService {
  private cache: { at: number; values: Map<string, SettingValue> } | null = null;
  private static readonly TTL_MS = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  private async load(): Promise<Map<string, SettingValue>> {
    if (this.cache && Date.now() - this.cache.at < SystemSettingsService.TTL_MS)
      return this.cache.values;
    const rows = await this.prisma.systemSetting.findMany();
    const values = new Map<string, SettingValue>(Object.entries(DEFAULT_SYSTEM_SETTINGS));
    for (const row of rows) {
      if (row.key in DEFAULT_SYSTEM_SETTINGS) values.set(row.key, row.value as SettingValue);
    }
    this.cache = { at: Date.now(), values };
    return values;
  }

  async get<K extends SystemSettingKey>(key: K): Promise<(typeof DEFAULT_SYSTEM_SETTINGS)[K]> {
    const values = await this.load();
    return values.get(key) as (typeof DEFAULT_SYSTEM_SETTINGS)[K];
  }

  async list(): Promise<{ key: string; value: SettingValue; updatedAt: string | null }[]> {
    const rows = await this.prisma.systemSetting.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return (Object.keys(DEFAULT_SYSTEM_SETTINGS) as SystemSettingKey[]).map((key) => {
      const row = byKey.get(key);
      return {
        key,
        value: (row?.value as SettingValue | undefined) ?? DEFAULT_SYSTEM_SETTINGS[key],
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });
  }

  async set(
    key: string,
    value: unknown,
    adminId: string,
  ): Promise<{ key: string; value: SettingValue; previous: SettingValue }> {
    if (!(key in DEFAULT_SYSTEM_SETTINGS)) throw AppException.validation(`Unknown setting: ${key}`);
    const k = key as SystemSettingKey;
    const def = DEFAULT_SYSTEM_SETTINGS[k];
    const coerced = this.coerce(k, def, value);
    const previous = await this.get(k);
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: coerced as Prisma.InputJsonValue, updatedById: adminId },
      update: { value: coerced as Prisma.InputJsonValue, updatedById: adminId },
    });
    this.cache = null;
    return { key, value: coerced, previous };
  }

  private coerce(key: SystemSettingKey, def: SettingValue, value: unknown): SettingValue {
    if (typeof def === 'number') {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 1_000_000)
        throw AppException.validation(`${key} must be a non-negative integer`);
      if (key === 'reminders.sendHourLocal' && n > 23)
        throw AppException.validation('sendHourLocal must be 0-23');
      return n;
    }
    if (typeof def === 'boolean') {
      if (typeof value !== 'boolean') throw AppException.validation(`${key} must be a boolean`);
      return value;
    }
    if (typeof value !== 'string' || value.length > 200)
      throw AppException.validation(`${key} must be a string (max 200)`);
    if (key === 'app.defaultLanguage' && !['uz', 'ru', 'en'].includes(value))
      throw AppException.validation('Invalid language');
    return value.trim();
  }

  async thresholds(): Promise<ReminderThresholds> {
    return {
      dueSoonDays: await this.get('reminders.dueSoonDays'),
      dueSoonKm: await this.get('reminders.dueSoonKm'),
      overdueGraceDays: await this.get('reminders.overdueGraceDays'),
      overdueGraceKm: await this.get('reminders.overdueGraceKm'),
      mileageStaleDays: await this.get('reminders.mileageStaleDays'),
    };
  }

  invalidate(): void {
    this.cache = null;
  }
}
