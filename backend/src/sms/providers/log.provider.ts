import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SmsProvider, SmsSendRequest, SmsSendResult } from '../sms-provider.interface';

/**
 * LOCAL DEVELOPMENT ONLY. Writes the SMS text to the server log instead of delivering it.
 * Environment validation refuses to start the server with this provider when NODE_ENV=production.
 */
export class LogSmsProvider implements SmsProvider {
  readonly name = 'log';
  private readonly logger = new Logger('DevSmsProvider');

  constructor(private readonly nodeEnv: string) {
    if (nodeEnv === 'production') throw new Error('LogSmsProvider cannot be used in production');
  }

  isConfigured(): boolean {
    return true;
  }

  async send(req: SmsSendRequest): Promise<SmsSendResult> {
    this.logger.warn(`[DEV ONLY — SMS NOT DELIVERED] to=${req.to} text="${req.text}"`);
    return { providerMessageId: `dev-${randomUUID()}`, accepted: true };
  }
}
