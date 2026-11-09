import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { APP_ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { CurrentAdmin, Public, type AuthAdmin } from '../../common/decorators/auth.decorators';
import { AppException } from '../../common/errors/app-exception';
import { clientIp, userAgent } from '../../common/utils/request';
import { AdminGuard } from '../admin.guard';
import { AuditService } from '../audit.service';
import { AdminLoginDto, ChangePasswordDto } from '../dto/admin.dto';
import { AdminAuthService } from './admin-auth.service';

export const ADMIN_REFRESH_COOKIE = 'mb_admin_rt';
// Read at decoration time; the value is validated by the env schema at startup (default 10).
const LOGIN_LIMIT = Number(process.env.RATE_LIMIT_ADMIN_LOGIN_PER_MINUTE ?? 10) || 10;
const CSRF_HEADER = 'x-requested-with';

@ApiTags('Admin · Auth')
@Public()
@Controller({ path: 'admin/auth', version: '1' })
export class AdminAuthController {
  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly auth: AdminAuthService,
    private readonly audit: AuditService,
  ) {}

  private cookieOptions(expires?: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/v1/admin/auth',
      expires,
    };
  }

  /** Cookie-authenticated endpoints additionally require a custom header (CSRF defence). */
  private requireCsrfHeader(req: Request): void {
    if (req.headers[CSRF_HEADER] !== 'moshina-admin')
      throw AppException.forbidden('Missing CSRF header');
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: 60_000 } })
  @ApiOperation({ summary: 'Administrator login (sets httpOnly refresh cookie)' })
  async login(
    @Body() dto: AdminLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = { ip: clientIp(req), userAgent: userAgent(req) };
    try {
      const { tokens, adminId } = await this.auth.login(dto.email, dto.password, ctx);
      res.cookie(
        ADMIN_REFRESH_COOKIE,
        tokens.refreshToken,
        this.cookieOptions(tokens.refreshExpiresAt),
      );
      await this.audit.log({ adminId, action: 'auth.login', req });
      return {
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        admin: await this.auth.profile(adminId),
      };
    } catch (err) {
      await this.audit.log({
        adminId: null,
        action: 'auth.login_failed',
        metadata: { email: dto.email.toLowerCase().slice(0, 254) },
        req,
      });
      throw err;
    }
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiCookieAuth(ADMIN_REFRESH_COOKIE)
  @ApiHeader({ name: 'X-Requested-With', required: true, description: 'Must be "moshina-admin"' })
  @ApiOperation({ summary: 'Rotate the admin session using the refresh cookie' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.requireCsrfHeader(req);
    const token = (req.cookies as Record<string, string> | undefined)?.[ADMIN_REFRESH_COOKIE];
    try {
      const { tokens, adminId } = await this.auth.refresh(token, {
        ip: clientIp(req),
        userAgent: userAgent(req),
      });
      res.cookie(
        ADMIN_REFRESH_COOKIE,
        tokens.refreshToken,
        this.cookieOptions(tokens.refreshExpiresAt),
      );
      return {
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        admin: await this.auth.profile(adminId),
      };
    } catch (err) {
      res.clearCookie(ADMIN_REFRESH_COOKIE, this.cookieOptions());
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @ApiHeader({ name: 'X-Requested-With', required: true })
  @ApiOperation({ summary: 'End the admin session' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    this.requireCsrfHeader(req);
    const adminId = await this.auth.logout(
      (req.cookies as Record<string, string> | undefined)?.[ADMIN_REFRESH_COOKIE],
    );
    res.clearCookie(ADMIN_REFRESH_COOKIE, this.cookieOptions());
    if (adminId) await this.audit.log({ adminId, action: 'auth.logout', req });
  }

  @Get('me')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current administrator profile and permissions' })
  me(@CurrentAdmin() admin: AuthAdmin) {
    return this.auth.profile(admin.id);
  }

  @Post('password')
  @HttpCode(204)
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change own password (signs out all sessions)' })
  async changePassword(
    @CurrentAdmin() admin: AuthAdmin,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.changePassword(admin.id, dto.currentPassword, dto.newPassword);
    res.clearCookie(ADMIN_REFRESH_COOKIE, this.cookieOptions());
    await this.audit.log({
      adminId: admin.id,
      action: 'auth.password_changed',
      entityType: 'admin',
      entityId: admin.id,
      req,
    });
  }
}
