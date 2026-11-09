import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ERROR_CODES, isUzbekPhone } from '@moshina/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { SmsProvider, SmsProviderError, SmsSendRequest, SmsSendResult } from './sms-provider.interface';

export const SMS_PRIMARY_PROVIDER = Symbol('SMS_PRIMARY_PROVIDER');
export const SMS_INTERNATIONAL_PROVIDER = Symbol('SMS_INTERNATIONAL_PROVIDER');

export interface SmsDispatchResult extends SmsSendResult {
  provider: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PRIMARY_PROVIDER) private readonly primary: SmsProvider,
    @Inject(SMS_INTERNATIONAL_PROVIDER) private readonly international: SmsProvider | null,
  ) {}

  /** Returns the provider responsible for a phone number, or null if no provider can deliver to it. */
  providerFor(phone: string): SmsProvider | null {
    if (isUzbekPhone(phone)) return this.primary;
    // The primary provider may itself be international-capable (Twilio, or the dev logger).
    if (this.primary.name !== 'eskiz') return this.primary;
    return this.international;
  }

  canDeliverTo(phone: string): boolean {
    const p = this.providerFor(phone);
    return p !== null && p.isConfigured();
  }

  async send(req: SmsSendRequest): Promise<SmsDispatchResult> {
    const provider = this.providerFor(req.to);
    if (!provider) {
      throw new AppException(
        ERROR_CODES.PHONE_INVALID,
        HttpStatus.BAD_REQUEST,
        'SMS delivery to this country is not supported. Please use an Uzbekistan (+998) number.',
      );
    }
    if (!provider.isConfigured()) {
      this.logger.error(`SMS provider "${provider.name}" is not configured — cannot deliver verification codes`);
      await this.recordEvent(provider.name, false, 'Provider not configured');
      throw new AppException(
        ERROR_CODES.SMS_NOT_CONFIGURED,
        HttpStatus.SERVICE_UNAVAILABLE,
        'SMS service is temporarily unavailable. Please try again later.',
      );
    }
    try {
      const result = await provider.send(req);
      await this.recordEvent(provider.name, true, null);
      return { ...result, provider: provider.name };
    } catch (err) {
      const message = err instanceof SmsProviderError ? err.message : `Unexpected SMS error: ${(err as Error).message}`;
      // Never log the message text: it contains the verification code.
      this.logger.error({ provider: provider.name, reference: req.reference, error: message }, 'SMS send failed');
      await this.recordEvent(provider.name, false, message);
      throw new AppException(
        ERROR_CODES.SMS_SEND_FAILED,
        HttpStatus.BAD_GATEWAY,
        'We could not send the SMS. Please try again in a moment.',
      );
    }
  }

  private async recordEvent(provider: string, success: boolean, error: string | null): Promise<void> {
    await this.prisma.smsProviderEvent
      .create({ data: { provider, success, error: error?.slice(0, 500) ?? null } })
      .catch((e: Error) => this.logger.warn(`Failed to record SMS provider event: ${e.message}`));
  }

  async status(): Promise<{
    provider: string;
    configured: boolean;
    internationalProvider: string | null;
    internationalConfigured: boolean;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastError: string | null;
  }> {
    const [lastSuccess, lastFailure] = await Promise.all([
      this.prisma.smsProviderEvent.findFirst({ where: { success: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.smsProviderEvent.findFirst({ where: { success: false }, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      provider: this.primary.name,
      configured: this.primary.isConfigured(),
      internationalProvider: this.international?.name ?? null,
      internationalConfigured: this.international?.isConfigured() ?? false,
      lastSuccessAt: lastSuccess?.createdAt.toISOString() ?? null,
      lastFailureAt: lastFailure?.createdAt.toISOString() ?? null,
      lastError: lastFailure?.error ?? null,
    };
  }
}
