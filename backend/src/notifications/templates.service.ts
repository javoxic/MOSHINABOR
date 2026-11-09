import { Injectable } from '@nestjs/common';
import type { NotificationTemplate, NotificationType } from '@prisma/client';
import type { Language } from '@moshina/shared';
import { PrismaService } from '../prisma/prisma.service';

export const TEMPLATE_PLACEHOLDERS: Record<NotificationType, string[]> = {
  MAINTENANCE_UPCOMING: ['service', 'vehicle', 'days', 'km', 'date'],
  MAINTENANCE_DUE: ['service', 'vehicle', 'date'],
  MAINTENANCE_OVERDUE: ['service', 'vehicle', 'date'],
  MILEAGE_UPDATE_REQUIRED: ['vehicle', 'days'],
  ANNOUNCEMENT: [],
};

/** Substitutes {placeholders}; unknown placeholders are left untouched. */
export function renderTemplate(
  text: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return text
    .replace(/\{(\w+)\}/g, (match, key: string) => {
      const v = vars[key];
      return v === null || v === undefined ? match : String(v);
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

@Injectable()
export class TemplatesService {
  private cache: { at: number; byCode: Map<NotificationType, NotificationTemplate> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(code: NotificationType): Promise<NotificationTemplate | null> {
    if (!this.cache || Date.now() - this.cache.at > 60_000) {
      const rows = await this.prisma.notificationTemplate.findMany();
      this.cache = { at: Date.now(), byCode: new Map(rows.map((r) => [r.code, r])) };
    }
    return this.cache.byCode.get(code) ?? null;
  }

  invalidate(): void {
    this.cache = null;
  }

  async render(
    code: NotificationType,
    lang: Language,
    vars: Record<string, string | number | null | undefined>,
  ): Promise<{ title: string; body: string } | null> {
    const t = await this.get(code);
    if (!t || !t.isActive) return null;
    const title = lang === 'ru' ? t.titleRu : lang === 'en' ? t.titleEn : t.titleUz;
    const body = lang === 'ru' ? t.bodyRu : lang === 'en' ? t.bodyEn : t.bodyUz;
    return { title: renderTemplate(title, vars), body: renderTemplate(body, vars) };
  }
}
