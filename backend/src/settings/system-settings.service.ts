import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_SYSTEM_SETTINGS,
  REGISTRATION_MODES,
  type ReminderThresholds,
  type SystemSettingKey,
} from '@moshina/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { APP_ENV } from '../config/config.module';
import type { Env } from '../config/env';

type SettingValue = string | number | boolean;

@Injectable()
export class SystemSettingsService {
  private cache: { at: number; values: Map<string, SettingValue> } | null = null;
  // Short TTL: maintenance mode and registration mode must take effect quickly on every API instance.
  private static readonly TTL_MS = 10_000;

  /**
   * Defaults for settings that no administrator has set yet. Staging is a public, invite-only
   * pilot: it starts in 'allowlist' mode so that a fresh deployment never accepts (and never sends
   * SMS to) arbitrary phone numbers before an administrator has configured it. Opening it is an
   * explicit, audited admin decision.
   */
  private readonly defaults: Record<string, SettingValue>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) env: Env,
  ) {
    this.defaults = {
      ...DEFAULT_SYSTEM_SETTINGS,
      ...(env.DEPLOYMENT_ENVIRONMENT === 'staging'
        ? { 'access.registrationMode': 'allowlist' }
        : {}),
    };
  }

  private async load(): Promise<Map<string, SettingValue>> {
    if (this.cache && Date.now() - this.cache.at < SystemSettingsService.TTL_MS)
      return this.cache.values;
    const rows = await this.prisma.systemSetting.findMany();
    const values = new Map<string, SettingValue>(Object.entries(this.defaults));
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
        value: (row?.value as SettingValue | undefined) ?? this.defaults[key],
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
    if (
      key === 'access.registrationMode' &&
      !(REGISTRATION_MODES as readonly string[]).includes(value)
    )
      throw AppException.validation(
        `registrationMode must be one of ${REGISTRATION_MODES.join(', ')}`,
      );
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
