import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { maskPhone } from '@moshina/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app-exception';
import { paginate, parseSort } from '../../common/dto/pagination.dto';
import { TokenService } from '../../auth/token.service';
import type { AdminUserQueryDto } from '../dto/admin.dto';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  private phone(p: string, pii: boolean): string {
    return pii ? p : maskPhone(p);
  }

  async list(q: AdminUserQueryDto, pii: boolean) {
    const where: Prisma.UserWhereInput = { status: q.status, settings: q.language ? { is: { language: q.language } } : undefined };
    if (q.registeredFrom || q.registeredTo) {
      where.createdAt = { gte: q.registeredFrom ? new Date(q.registeredFrom) : undefined, lte: q.registeredTo ? new Date(q.registeredTo) : undefined };
    }
    const term = q.q?.trim();
    if (term) {
      const digits = term.replace(/\D/g, '');
      where.OR = [{ fullName: { contains: term, mode: 'insensitive' } }];
      // Searching by phone requires PII access, otherwise masked digits could be brute-forced.
      if (pii && digits.length >= 3) where.OR.push({ phone: { contains: digits } });
    }
    const sort = parseSort(q.sort, ['createdAt', 'lastActiveAt', 'fullName'] as const, { field: 'createdAt', dir: 'desc' });
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { settings: { select: { language: true } }, _count: { select: { vehicles: true } } },
        orderBy: { [sort.field]: { sort: sort.dir, nulls: 'last' } },
        ...paginate(q),
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: rows.map((u) => ({
        id: u.id,
        phone: this.phone(u.phone, pii),
        fullName: u.fullName,
        status: u.status,
        language: u.settings?.language ?? 'uz',
        vehicleCount: u._count.vehicles,
        createdAt: u.createdAt.toISOString(),
        lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async detail(id: string, pii: boolean) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        settings: true,
        vehicles: { select: { id: true, brand: true, model: true, year: true, registrationNumber: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
        pushDevices: { orderBy: { lastSeenAt: 'desc' } },
        _count: { select: { vehicles: true, records: true, expenses: true, schedules: true, notifications: true } },
      },
    });
    if (!u) throw AppException.notFound('User');
    const now = new Date();
    const [activeSessions, sessions, records, expenses] = await Promise.all([
      this.prisma.refreshToken.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: now } } }),
      this.prisma.refreshToken.findMany({ where: { userId: id, revokedReason: { not: 'rotated' } }, orderBy: { createdAt: 'desc' }, take: 5, select: { createdAt: true, revokedReason: true } }),
      this.prisma.maintenanceRecord.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 5, include: { serviceType: { select: { nameEn: true } } } }),
      this.prisma.expense.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 5, select: { category: true, createdAt: true } }),
    ]);
    const activity = [
      ...u.vehicles.map((v) => ({ type: 'VEHICLE_ADDED', description: `Added vehicle ${v.brand} ${v.model}`, at: v.createdAt.toISOString() })),
      ...records.map((r) => ({ type: 'SERVICE_RECORDED', description: `Recorded service: ${r.serviceType.nameEn}`, at: r.createdAt.toISOString() })),
      ...expenses.map((e) => ({ type: 'EXPENSE_ADDED', description: `Added ${e.category.toLowerCase()} expense`, at: e.createdAt.toISOString() })),
      ...sessions.map((s) => ({ type: 'SIGN_IN', description: s.revokedReason ? `Signed in (session ended: ${s.revokedReason})` : 'Signed in', at: s.createdAt.toISOString() })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 15);
    return {
      id: u.id,
      phone: this.phone(u.phone, pii),
      fullName: u.fullName,
      status: u.status,
      language: u.settings?.language ?? 'uz',
      vehicleCount: u._count.vehicles,
      createdAt: u.createdAt.toISOString(),
      lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
      restrictionReason: u.restrictionReason,
      deletionRequestedAt: u.deletionRequestedAt?.toISOString() ?? null,
      activeSessions,
      pushDevices: u.pushDevices.map((d) => ({ id: d.id, platform: d.platform, lastSeenAt: d.lastSeenAt.toISOString(), disabled: d.disabledAt !== null })),
      counts: u._count,
      vehicles: u.vehicles.map(({ createdAt: _c, ...v }) => v),
      recentActivity: activity,
    };
  }

  async restrict(id: string, reason: string): Promise<{ revokedSessions: number }> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw AppException.notFound('User');
    if (u.status === 'RESTRICTED') throw AppException.conflict('User is already restricted');
    await this.prisma.user.update({ where: { id }, data: { status: 'RESTRICTED', restrictionReason: reason } });
    return { revokedSessions: await this.tokens.revokeAllForUser(id, 'restricted') };
  }

  async unrestrict(id: string): Promise<void> {
    const r = await this.prisma.user.updateMany({ where: { id, status: 'RESTRICTED' }, data: { status: 'ACTIVE', restrictionReason: null } });
    if (r.count === 0) throw AppException.conflict('User is not restricted');
  }

  async revokeSessions(id: string): Promise<number> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw AppException.notFound('User');
    return this.tokens.revokeAllForUser(id, 'admin_revoked');
  }
}
