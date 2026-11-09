import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES, maskPhone, normalizePhone } from '@moshina/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SystemSettingsService } from '../settings/system-settings.service';
import { AppException } from '../common/errors/app-exception';
import { paginate } from '../common/dto/pagination.dto';

/** Pilot access control: while registration mode is 'allowlist', only invited phone numbers may sign in. */
@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SystemSettingsService,
  ) {}

  async assertMaySignIn(phoneE164: string): Promise<void> {
    if ((await this.settings.get('access.registrationMode')) !== 'allowlist') return;
    const entry = await this.prisma.accessAllowlistEntry.findUnique({
      where: { phone: phoneE164 },
    });
    if (!entry) {
      throw new AppException(
        ERROR_CODES.PILOT_ACCESS_ONLY,
        HttpStatus.FORBIDDEN,
        'MOSHINA BOR is in a limited pilot. This number has not been invited yet.',
      );
    }
  }

  async list(q: { page: number; pageSize: number }, pii: boolean) {
    const [rows, total] = await Promise.all([
      this.prisma.accessAllowlistEntry.findMany({ orderBy: { createdAt: 'desc' }, ...paginate(q) }),
      this.prisma.accessAllowlistEntry.count(),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        phone: pii ? r.phone : maskPhone(r.phone),
        note: r.note,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async add(rawPhone: string, note: string | undefined, adminId: string) {
    const phone = normalizePhone(rawPhone)?.e164;
    if (!phone)
      throw new AppException(
        ERROR_CODES.PHONE_INVALID,
        HttpStatus.BAD_REQUEST,
        'Enter a valid mobile number',
      );
    const existing = await this.prisma.accessAllowlistEntry.findUnique({ where: { phone } });
    if (existing) throw AppException.conflict('This number is already invited');
    return this.prisma.accessAllowlistEntry.create({
      data: { phone, note: note?.trim() || null, createdById: adminId },
    });
  }

  async remove(id: string): Promise<{ phone: string }> {
    const entry = await this.prisma.accessAllowlistEntry.findUnique({ where: { id } });
    if (!entry) throw AppException.notFound('Invitation');
    await this.prisma.accessAllowlistEntry.delete({ where: { id } });
    return { phone: entry.phone };
  }
}
