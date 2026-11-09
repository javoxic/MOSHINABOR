import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ERROR_CODES } from '@moshina/shared';
import { IS_PUBLIC_KEY, type AuthUser } from '../decorators/auth.decorators';
import { AppException } from '../errors/app-exception';
import { TokenService } from '../../auth/token.service';
import { PrismaService } from '../../prisma/prisma.service';

const ACTIVITY_UPDATE_INTERVAL_MS = 15 * 60_000;

/**
 * Global guard: every route requires a mobile-user token unless marked @Public(). Admin
 * controllers are marked @Public() for this guard and protected by AdminGuard instead, so a
 * controller that forgets its guard fails closed (requires a user token) rather than open.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw AppException.unauthorized();
    const payload = await this.tokens.verifyAccess(header.slice(7));

    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        status: true,
        lastActiveAt: true,
        refreshTokens: {
          where: { familyId: payload.fam, revokedAt: null, expiresAt: { gt: now } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!user || user.status === 'DELETED' || user.refreshTokens.length === 0) {
      throw AppException.unauthorized('Session is no longer valid');
    }
    if (user.status === 'RESTRICTED') {
      throw new AppException(
        ERROR_CODES.ACCOUNT_RESTRICTED,
        HttpStatus.FORBIDDEN,
        'Your account has been restricted. Contact support.',
      );
    }
    if (
      !user.lastActiveAt ||
      now.getTime() - user.lastActiveAt.getTime() > ACTIVITY_UPDATE_INTERVAL_MS
    ) {
      await this.prisma.user.update({ where: { id: payload.sub }, data: { lastActiveAt: now } });
    }
    req.user = { id: payload.sub, sessionFamilyId: payload.fam };
    return true;
  }
}
