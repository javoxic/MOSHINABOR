import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../common/decorators/auth.decorators';
import { APP_ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { mapEskizStatus } from './providers/eskiz.provider';
import { mapTwilioStatus } from './providers/twilio.provider';

/** Delivery-report callbacks from SMS providers. Authenticated by a shared secret in the callback URL. */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller({ path: 'webhooks/sms', version: '1' })
export class SmsWebhookController {
  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {}

  private verify(secret: string | undefined): void {
    const expected = this.env.SMS_CALLBACK_SECRET;
    if (!expected || !secret) throw new ForbiddenException();
    const a = Buffer.from(secret);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException();
  }

  @Post('eskiz')
  @HttpCode(200)
  async eskiz(
    @Query('secret') secret: string | undefined,
    @Body() body: Record<string, unknown>,
  ): Promise<{ ok: true }> {
    this.verify(secret);
    const messageId =
      typeof body.message_id === 'string'
        ? body.message_id
        : typeof body.id === 'string'
          ? body.id
          : null;
    if (messageId) {
      const status = mapEskizStatus(typeof body.status === 'string' ? body.status : undefined);
      await this.prisma.smsVerification.updateMany({
        where: { providerMessageId: messageId },
        data: {
          smsStatus: status,
          smsError: status === 'FAILED' ? String(body.status).slice(0, 100) : null,
        },
      });
    }
    return { ok: true };
  }

  @Post('twilio')
  @HttpCode(200)
  async twilio(
    @Query('secret') secret: string | undefined,
    @Body() body: Record<string, unknown>,
  ): Promise<{ ok: true }> {
    this.verify(secret);
    const sid = typeof body.MessageSid === 'string' ? body.MessageSid : null;
    if (sid) {
      const raw = typeof body.MessageStatus === 'string' ? body.MessageStatus : undefined;
      const status = mapTwilioStatus(raw);
      await this.prisma.smsVerification.updateMany({
        where: { providerMessageId: sid },
        data: {
          smsStatus: status,
          smsError:
            status === 'FAILED' ? `${raw ?? ''} ${String(body.ErrorCode ?? '')}`.trim() : null,
        },
      });
    }
    return { ok: true };
  }
}
