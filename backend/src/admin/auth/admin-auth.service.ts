import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { ERROR_CODES, type AdminPermission } from '@moshina/shared';
import { APP_ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app-exception';
import { randomToken, sha256 } from '../../common/utils/crypto';
import type { AdminAccessPayload } from '../admin.guard';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
// Pre-computed hash used to equalize timing when the email does not exist.
let DUMMY_HASH: Promise<string> | null = null;

export const ARGON2_OPTIONS: argon2.Options = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashAdminPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export interface AdminSessionTokens {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async profile(adminId: string) {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({
      where: { id: adminId },
      include: { role: { include: { permissions: true } } },
    });
    return {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      role: { id: admin.role.id, code: admin.role.code, name: admin.role.name },
      permissions: admin.role.permissions.map((p) => p.permissionCode as AdminPermission).sort(),
    };
  }

  private async signAccess(adminId: string, sessionFamily: string): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + this.env.ADMIN_ACCESS_TOKEN_TTL_SECONDS * 1000);
    const payload: AdminAccessPayload = { sub: adminId, sid: sessionFamily, typ: 'admin' };
    const token = await this.jwt.signAsync(payload, {
      secret: this.env.JWT_ADMIN_SECRET,
      expiresIn: this.env.ADMIN_ACCESS_TOKEN_TTL_SECONDS,
      issuer: 'moshina-bor',
      audience: 'moshina-bor-admin',
    });
    return { token, expiresAt };
  }

  async login(email: string, password: string, ctx: { ip: string; userAgent: string | null }): Promise<{ tokens: AdminSessionTokens; adminId: string }> {
    const invalid = new AppException(ERROR_CODES.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED, 'Invalid email or password');
    const admin = await this.prisma.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!admin) {
      DUMMY_HASH ??= hashAdminPassword(randomToken(16));
      await argon2.verify(await DUMMY_HASH, password).catch(() => false);
      throw invalid;
    }
    const now = new Date();
    if (admin.lockedUntil && admin.lockedUntil > now) {
      throw new AppException(ERROR_CODES.ADMIN_LOCKED, HttpStatus.TOO_MANY_REQUESTS, 'Account temporarily locked after failed attempts. Try again later.', {
        retryAfterSeconds: Math.ceil((admin.lockedUntil.getTime() - now.getTime()) / 1000),
      });
    }
    const ok = await argon2.verify(admin.passwordHash, password).catch(() => false);
    if (!ok) {
      const failed = admin.failedAttempts + 1;
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: failed >= MAX_FAILED ? { failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) } : { failedAttempts: failed },
      });
      throw invalid;
    }
    if (!admin.isActive) throw new AppException(ERROR_CODES.FORBIDDEN, HttpStatus.FORBIDDEN, 'This administrator account is disabled');

    await this.prisma.adminUser.update({ where: { id: admin.id }, data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: now } });
    if (argon2.needsRehash(admin.passwordHash, ARGON2_OPTIONS)) {
      await this.prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash: await hashAdminPassword(password) } });
    }
    return { tokens: await this.newSession(admin.id, randomUUID(), ctx), adminId: admin.id };
  }

  private async newSession(adminId: string, familyId: string, ctx: { ip: string; userAgent: string | null }): Promise<AdminSessionTokens> {
    const refreshToken = randomToken();
    const refreshExpiresAt = new Date(Date.now() + this.env.ADMIN_SESSION_TTL_HOURS * 3600_000);
    await this.prisma.adminSession.create({
      data: { adminUserId: adminId, familyId, tokenHash: sha256(refreshToken), expiresAt: refreshExpiresAt, ip: ctx.ip, userAgent: ctx.userAgent },
    });
    const access = await this.signAccess(adminId, familyId);
    return { accessToken: access.token, accessTokenExpiresAt: access.expiresAt.toISOString(), refreshToken, refreshExpiresAt };
  }

  /** Rotates the admin refresh cookie. A reused (already rotated) token revokes the session family. */
  async refresh(refreshToken: string | undefined, ctx: { ip: string; userAgent: string | null }): Promise<{ tokens: AdminSessionTokens; adminId: string }> {
    if (!refreshToken) throw AppException.unauthorized('No session');
    const session = await this.prisma.adminSession.findUnique({ where: { tokenHash: sha256(refreshToken) }, include: { admin: true } });
    if (!session) throw AppException.unauthorized('Session expired');
    const now = new Date();
    if (session.revokedAt) {
      await this.prisma.adminSession.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: now } });
      throw new AppException(ERROR_CODES.REFRESH_TOKEN_REUSED, HttpStatus.UNAUTHORIZED, 'Session revoked for security reasons');
    }
    if (session.expiresAt <= now || !session.admin.isActive) throw AppException.unauthorized('Session expired');
    const claimed = await this.prisma.adminSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: now } });
    if (claimed.count === 0) throw AppException.unauthorized('Session expired');
    // Keep the absolute session expiry: rotation never extends it.
    const refreshTokenNew = randomToken();
    await this.prisma.adminSession.create({
      data: {
        adminUserId: session.adminUserId,
        familyId: session.familyId,
        tokenHash: sha256(refreshTokenNew),
        expiresAt: session.expiresAt,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });
    const access = await this.signAccess(session.adminUserId, session.familyId);
    return {
      adminId: session.adminUserId,
      tokens: { accessToken: access.token, accessTokenExpiresAt: access.expiresAt.toISOString(), refreshToken: refreshTokenNew, refreshExpiresAt: session.expiresAt },
    };
  }

  async logout(refreshToken: string | undefined): Promise<string | null> {
    if (!refreshToken) return null;
    const session = await this.prisma.adminSession.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (!session) return null;
    await this.prisma.adminSession.updateMany({ where: { familyId: session.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    return session.adminUserId;
  }

  async changePassword(adminId: string, currentPassword: string, newPassword: string): Promise<void> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    const ok = await argon2.verify(admin.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw new AppException(ERROR_CODES.INVALID_CREDENTIALS, HttpStatus.BAD_REQUEST, 'Current password is incorrect');
    await this.prisma.$transaction([
      this.prisma.adminUser.update({ where: { id: adminId }, data: { passwordHash: await hashAdminPassword(newPassword), passwordChangedAt: new Date() } }),
      this.prisma.adminSession.updateMany({ where: { adminUserId: adminId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  async revokeAllSessions(adminId: string): Promise<void> {
    await this.prisma.adminSession.updateMany({ where: { adminUserId: adminId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
