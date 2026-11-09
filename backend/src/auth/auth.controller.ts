import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser, Public, type AuthUser } from '../common/decorators/auth.decorators';
import { clientIp, userAgent } from '../common/utils/request';
import { AuthService } from './auth.service';
import { LogoutDto, OtpRequestDto, OtpVerifyDto, RefreshDto } from './dto/auth.dto';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  // Keyed by IP (anonymous); generous for carrier NAT — per-phone/per-IP hourly limits in OtpService are the abuse controls.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Send an SMS verification code',
    description:
      'Normalizes the phone to E.164 and sends a 6-digit code through the configured SMS provider. The response never contains the code and is identical for new and existing accounts.',
  })
  @ApiTooManyRequestsResponse({
    description: 'Resend cooldown or per-phone/per-IP limit reached (details.retryAfterSeconds)',
  })
  request(@Body() dto: OtpRequestDto, @Req() req: Request) {
    return this.auth.requestCode(dto.phone, clientIp(req), dto.language);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Verify the SMS code and obtain access/refresh tokens (creates the account on first sign-in)',
  })
  verify(@Body() dto: OtpVerifyDto, @Req() req: Request) {
    return this.auth.verifyCode(
      dto.phone,
      dto.code,
      { ip: clientIp(req), userAgent: userAgent(req) },
      dto.language,
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Rotate the refresh token. Reusing an old refresh token revokes the whole session.',
  })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, { ip: clientIp(req), userAgent: userAgent(req) });
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current session and unregister the push token' })
  async logout(@CurrentUser() user: AuthUser, @Body() dto: LogoutDto): Promise<void> {
    await this.auth.logout(user.id, user.sessionFamilyId, dto.refreshToken, dto.pushToken);
  }

  @Post('logout-all')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke all sessions of the current user' })
  async logoutAll(@CurrentUser() user: AuthUser): Promise<{ revoked: number }> {
    return { revoked: await this.auth.logoutAll(user.id) };
  }
}
