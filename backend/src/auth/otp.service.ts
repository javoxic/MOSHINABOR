import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ERROR_CODES, normalizePhone, type Language } from '@moshina/shared';
import { APP_ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { SmsService } from '../sms/sms.service';
import { AccessService } from '../access/access.service';
import { AppException } from '../common/errors/app-exception';
import { generateNumericCode, hmacSha256, safeEqualHex } from '../common/utils/crypto';

export interface OtpRequestResult {
  requestId: string;
  phone: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

@Injectable()
export class OtpService {
  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly access: AccessService,
  ) {}

  normalize(raw: string): string {
    const normalized = normalizePhone(raw);
    if (!normalized) {
      throw new AppException(
        ERROR_CODES.PHONE_INVALID,
        HttpStatus.BAD_REQUEST,
        'Enter a valid mobile phone number',
      );
    }
    return normalized.e164;
  }

  private hash(phone: string, code: string): string {
    return hmacSha256(this.env.OTP_PEPPER, `${phone}:${code}`);
  }

  private template(lang: Language): string {
    if (lang === 'ru') return this.env.SMS_OTP_TEMPLATE_RU;
    if (lang === 'en') return this.env.SMS_OTP_TEMPLATE_EN;
    return this.env.SMS_OTP_TEMPLATE_UZ;
  }

  private rateLimited(code: string, message: string, retryAfterSeconds: number): AppException {
    return new AppException(
      code as typeof ERROR_CODES.RATE_LIMITED,
      HttpStatus.TOO_MANY_REQUESTS,
      message,
      { retryAfterSeconds },
    );
  }

  async request(
    rawPhone: string,
    ip: string,
    language: Language = 'uz',
    now = new Date(),
  ): Promise<OtpRequestResult> {
    const phone = this.normalize(rawPhone);
    // Pilot gate before any SMS is sent (no SMS cost for uninvited numbers).
    await this.access.assertMaySignIn(phone);

    // Serialize concurrent requests for the same phone so limits cannot be raced.
    const lockKey = `otp:lock:${phone}`;
    const locked = await this.redis.set(lockKey, '1', 'EX', 15, 'NX');
    if (!locked)
      throw this.rateLimited(
        ERROR_CODES.OTP_RESEND_COOLDOWN,
        'A code is already being sent. Please wait.',
        5,
      );

    try {
      const hourAgo = new Date(now.getTime() - 3600_000);
      const dayAgo = new Date(now.getTime() - 86_400_000);
      const [latest, perPhoneHour, perPhoneDay, perIpHour] = await Promise.all([
        this.prisma.smsVerification.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } }),
        this.prisma.smsVerification.count({ where: { phone, createdAt: { gte: hourAgo } } }),
        this.prisma.smsVerification.count({ where: { phone, createdAt: { gte: dayAgo } } }),
        this.prisma.smsVerification.count({
          where: { requestIp: ip, createdAt: { gte: hourAgo } },
        }),
      ]);

      if (latest && latest.smsStatus !== 'FAILED') {
        const elapsed = (now.getTime() - latest.createdAt.getTime()) / 1000;
        if (elapsed < this.env.OTP_RESEND_COOLDOWN_SECONDS) {
          const wait = Math.ceil(this.env.OTP_RESEND_COOLDOWN_SECONDS - elapsed);
          throw this.rateLimited(
            ERROR_CODES.OTP_RESEND_COOLDOWN,
            `Please wait ${wait} seconds before requesting a new code`,
            wait,
          );
        }
      }
      if (
        perPhoneHour >= this.env.OTP_MAX_PER_PHONE_PER_HOUR ||
        perPhoneDay >= this.env.OTP_MAX_PER_PHONE_PER_DAY
      ) {
        throw this.rateLimited(
          ERROR_CODES.OTP_LIMIT_EXCEEDED,
          'Too many codes requested for this number. Try again later.',
          3600,
        );
      }
      if (perIpHour >= this.env.OTP_MAX_PER_IP_PER_HOUR) {
        throw this.rateLimited(
          ERROR_CODES.OTP_LIMIT_EXCEEDED,
          'Too many requests from this network. Try again later.',
          3600,
        );
      }

      const code = generateNumericCode(6);
      const expiresAt = new Date(now.getTime() + this.env.OTP_TTL_SECONDS * 1000);
      const provider = this.sms.providerFor(phone)?.name ?? 'none';

      const verification = await this.prisma.$transaction(async (tx) => {
        await tx.smsVerification.updateMany({
          where: { phone, consumedAt: null, invalidatedAt: null },
          data: { invalidatedAt: now },
        });
        return tx.smsVerification.create({
          data: {
            phone,
            codeHash: this.hash(phone, code),
            requestIp: ip,
            maxAttempts: this.env.OTP_MAX_ATTEMPTS,
            expiresAt,
            provider,
            createdAt: now,
          },
        });
      });

      try {
        const result = await this.sms.send({
          to: phone,
          text: this.template(language).replace('{code}', code),
          reference: verification.id,
        });
        await this.prisma.smsVerification.update({
          where: { id: verification.id },
          data: {
            smsStatus: 'SENT',
            providerMessageId: result.providerMessageId,
            provider: result.provider,
          },
        });
      } catch (err) {
        await this.prisma.smsVerification.update({
          where: { id: verification.id },
          data: {
            smsStatus: 'FAILED',
            invalidatedAt: new Date(),
            smsError: err instanceof Error ? err.message.slice(0, 500) : 'unknown',
          },
        });
        throw err;
      }

      return {
        requestId: verification.id,
        phone,
        expiresInSeconds: this.env.OTP_TTL_SECONDS,
        resendAfterSeconds: this.env.OTP_RESEND_COOLDOWN_SECONDS,
      };
    } finally {
      await this.redis.del(lockKey);
    }
  }

  /**
   * Verifies a code. Returns the normalized phone on success; throws otherwise.
   * Attempts are counted atomically so parallel guesses cannot exceed the limit.
   */
  async verify(rawPhone: string, code: string, now = new Date()): Promise<string> {
    const phone = this.normalize(rawPhone);
    const invalid = (remaining?: number) =>
      new AppException(
        ERROR_CODES.OTP_INVALID,
        HttpStatus.BAD_REQUEST,
        'The code is incorrect',
        remaining !== undefined ? { attemptsRemaining: remaining } : undefined,
      );

    const active = await this.prisma.smsVerification.findFirst({
      where: { phone, consumedAt: null, invalidatedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!active) {
      const latest = await this.prisma.smsVerification.findFirst({
        where: { phone },
        orderBy: { createdAt: 'desc' },
      });
      if (latest && !latest.consumedAt && latest.expiresAt <= now) {
        throw new AppException(
          ERROR_CODES.OTP_EXPIRED,
          HttpStatus.BAD_REQUEST,
          'The code has expired. Request a new one.',
        );
      }
      throw invalid();
    }
    if (active.expiresAt <= now) {
      throw new AppException(
        ERROR_CODES.OTP_EXPIRED,
        HttpStatus.BAD_REQUEST,
        'The code has expired. Request a new one.',
      );
    }

    const counted = await this.prisma.smsVerification.updateMany({
      where: {
        id: active.id,
        attempts: { lt: active.maxAttempts },
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count === 0) {
      throw new AppException(
        ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
        HttpStatus.TOO_MANY_REQUESTS,
        'Too many incorrect attempts. Request a new code.',
      );
    }
    const attemptsUsed = active.attempts + 1;

    if (!safeEqualHex(active.codeHash, this.hash(phone, code))) {
      const remaining = Math.max(0, active.maxAttempts - attemptsUsed);
      if (remaining === 0) {
        await this.prisma.smsVerification.update({
          where: { id: active.id },
          data: { invalidatedAt: now },
        });
        throw new AppException(
          ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
          HttpStatus.TOO_MANY_REQUESTS,
          'Too many incorrect attempts. Request a new code.',
        );
      }
      throw invalid(remaining);
    }

    const consumed = await this.prisma.smsVerification.updateMany({
      where: { id: active.id, consumedAt: null, invalidatedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count === 0) throw invalid();
    return phone;
  }
}
