import type { Env } from '../../config/env';
import { SmsProvider, SmsProviderError, SmsSendRequest, SmsSendResult } from '../sms-provider.interface';

/** Twilio Programmable Messaging (https://www.twilio.com/docs/messaging/api/message-resource). */
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio';

  constructor(
    private readonly env: Env,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.env.TWILIO_ACCOUNT_SID &&
        this.env.TWILIO_AUTH_TOKEN &&
        (this.env.TWILIO_FROM || this.env.TWILIO_MESSAGING_SERVICE_SID),
    );
  }

  async send(req: SmsSendRequest): Promise<SmsSendResult> {
    if (!this.isConfigured()) throw new SmsProviderError('Twilio credentials are not configured', false, 'NOT_CONFIGURED');
    const sid = this.env.TWILIO_ACCOUNT_SID as string;
    const body = new URLSearchParams({ To: req.to, Body: req.text });
    if (this.env.TWILIO_MESSAGING_SERVICE_SID) body.set('MessagingServiceSid', this.env.TWILIO_MESSAGING_SERVICE_SID);
    else body.set('From', this.env.TWILIO_FROM as string);
    if (this.env.SMS_CALLBACK_SECRET) {
      body.set(
        'StatusCallback',
        `${this.env.API_PUBLIC_URL}/v1/webhooks/sms/twilio?secret=${encodeURIComponent(this.env.SMS_CALLBACK_SECRET)}`,
      );
    }
    let res: Response;
    try {
      res = await this.fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${this.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new SmsProviderError(`Twilio request failed: ${(err as Error).message}`, true, 'NETWORK');
    }
    const json = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string; code?: number };
    if (!res.ok) {
      throw new SmsProviderError(
        `Twilio rejected the message (HTTP ${res.status}): ${json.message ?? 'unknown error'}`,
        res.status >= 500 || res.status === 429,
        json.code ? String(json.code) : `HTTP_${res.status}`,
      );
    }
    if (json.status === 'failed' || json.status === 'undelivered') {
      throw new SmsProviderError(`Twilio returned status "${json.status}"`, false, json.status);
    }
    return { providerMessageId: json.sid ?? null, accepted: true };
  }
}

export function mapTwilioStatus(status: string | undefined): 'DELIVERED' | 'FAILED' | 'SENT' {
  if (status === 'delivered') return 'DELIVERED';
  if (status === 'failed' || status === 'undelivered' || status === 'canceled') return 'FAILED';
  return 'SENT';
}
