import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { ERROR_CODES } from '@moshina/shared';
import { APP_ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { randomToken, sha256 } from '../common/utils/crypto';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface AccessPayload {
  sub: string;
  fam: string;
  typ: 'user';
}

export interface ClientContext {
  ip: string;
  userAgent: string | null;
}

@Injectable()
export class TokenService {
  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private async signAccess(
    userId: string,
    familyId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + this.env.ACCESS_TOKEN_TTL_SECONDS * 1000);
    const payload: AccessPayload = { sub: userId, fam: familyId, typ: 'user' };
    const token = await this.jwt.signAsync(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS,
      algorithm: 'HS256',
      issuer: 'moshina-bor',
      audience: 'moshina-bor-mobile',
    });
    return { token, expiresAt };
  }

  async verifyAccess(token: string): Promise<AccessPayload> {
    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
        issuer: 'moshina-bor',
        audience: 'moshina-bor-mobile',
        algorithms: ['HS256'],
      });
      if (payload.typ !== 'user' || !payload.sub || !payload.fam) throw new Error('bad payload');
      return payload;
    } catch {
      throw AppException.unauthorized('Access token is invalid or expired');
    }
  }

  async issue(userId: string, ctx: ClientContext): Promise<IssuedTokens> {
    const familyId = randomUUID();
    const refresh = randomToken();
    const refreshExpiresAt = new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(refresh),
        expiresAt: refreshExpiresAt,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });
    const access = await this.signAccess(userId, familyId);
    return {
      accessToken: access.token,
      refreshToken: refresh,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    };
  }

  /**
   * Rotates a refresh token. Presenting an already-rotated token is treated as token theft:
   * the whole session family is revoked.
   */
  async rotate(refreshToken: string, ctx: ClientContext): Promise<IssuedTokens> {
    const now = new Date();
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: { select: { status: true } } },
    });
    const invalid = new AppException(
      ERROR_CODES.REFRESH_TOKEN_INVALID,
      HttpStatus.UNAUTHORIZED,
      'Session expired. Please sign in again.',
    );
    if (!existing) throw invalid;

    if (existing.revokedAt) {
      if (existing.revokedReason === 'rotated') {
        await this.revokeFamily(existing.familyId, 'reuse_detected');
        throw new AppException(
          ERROR_CODES.REFRESH_TOKEN_REUSED,
          HttpStatus.UNAUTHORIZED,
          'Session was revoked for security reasons. Please sign in again.',
        );
      }
      throw invalid;
    }
    if (existing.expiresAt <= now) throw invalid;
    if (existing.user.status === 'RESTRICTED') {
      await this.revokeFamily(existing.familyId, 'restricted');
      throw new AppException(
        ERROR_CODES.ACCOUNT_RESTRICTED,
        HttpStatus.FORBIDDEN,
        'Your account has been restricted. Contact support.',
      );
    }
    if (existing.user.status === 'DELETED') {
      await this.revokeFamily(existing.familyId, 'deleted');
      throw invalid;
    }

    const refresh = randomToken();
    // Refresh tokens keep the family's original absolute lifetime window sliding by TTL from each rotation.
    const refreshExpiresAt = new Date(now.getTime() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'rotated', lastUsedAt: now },
      });
      if (claimed.count === 0) throw invalid; // lost a race with a parallel rotation
      const created = await tx.refreshToken.create({
        data: {
          userId: existing.userId,
          familyId: existing.familyId,
          tokenHash: sha256(refresh),
          expiresAt: refreshExpiresAt,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
      });
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { replacedById: created.id },
      });
    });

    const access = await this.signAccess(existing.userId, existing.familyId);
    return {
      accessToken: access.token,
      refreshToken: refresh,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    };
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: string): Promise<number> {
    const r = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return r.count;
  }

  async familyOf(refreshToken: string): Promise<{ familyId: string; userId: string } | null> {
    const t = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      select: { familyId: true, userId: true },
    });
    return t;
  }
}
