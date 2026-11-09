import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AdminPermission } from '@moshina/shared';
import { APP_ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { PERMISSIONS_KEY, type AuthAdmin } from '../common/decorators/auth.decorators';

export interface AdminAccessPayload {
  sub: string;
  sid: string;
  typ: 'admin';
}

/**
 * Authenticates admin access tokens and enforces @RequirePermissions. The admin, role and
 * permissions are reloaded from the database on every request, so disabling an admin or
 * changing a role takes effect immediately.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { admin?: AuthAdmin }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw AppException.unauthorized();
    let payload: AdminAccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AdminAccessPayload>(header.slice(7), {
        secret: this.env.JWT_ADMIN_SECRET,
        issuer: 'moshina-bor',
        audience: 'moshina-bor-admin',
      });
    } catch {
      throw AppException.unauthorized('Access token is invalid or expired');
    }
    if (payload.typ !== 'admin') throw AppException.unauthorized();

    const now = new Date();
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      include: {
        role: { include: { permissions: true } },
        sessions: { where: { familyId: payload.sid, revokedAt: null, expiresAt: { gt: now } }, select: { id: true }, take: 1 },
      },
    });
    if (!admin || !admin.isActive || admin.sessions.length === 0) throw AppException.unauthorized('Session is no longer valid');

    const permissions = new Set(admin.role.permissions.map((p) => p.permissionCode as AdminPermission));
    const required = this.reflector.getAllAndOverride<AdminPermission[] | undefined>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]) ?? [];
    for (const p of required) {
      if (!permissions.has(p)) throw AppException.forbidden(`Missing permission: ${p}`);
    }
    req.admin = { id: admin.id, email: admin.email, roleId: admin.roleId, permissions };
    return true;
  }
}
