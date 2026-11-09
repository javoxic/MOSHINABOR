import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env';
import {
  SmsProvider,
  SmsProviderError,
  SmsSendRequest,
  SmsSendResult,
} from '../sms-provider.interface';

const TOKEN_CACHE_KEY = 'sms:eskiz:token';
const TOKEN_TTL_SECONDS = 25 * 24 * 3600; // Eskiz tokens are valid for 30 days.

/**
 * Eskiz.uz SMS gateway (https://documenter.getpostman.com/view/663428/RzfmES4z).
 * Note: Eskiz requires the SMS text to match a template approved in the Eskiz cabinet.
 */
export class EskizSmsProvider implements SmsProvider {
  readonly name = 'eskiz';
  private readonly logger = new Logger(EskizSmsProvider.name);

  constructor(
    private readonly env: Env,
    private readonly redis: Redis,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.env.ESKIZ_EMAIL && this.env.ESKIZ_PASSWORD && this.env.ESKIZ_FROM);
  }

  private async login(): Promise<string> {
    const form = new FormData();
    form.set('email', this.env.ESKIZ_EMAIL ?? '');
    form.set('password', this.env.ESKIZ_PASSWORD ?? '');
    const res = await this.request('/auth/login', { method: 'POST', body: form });
    if (!res.ok) {
      throw new SmsProviderError(
        `Eskiz authentication failed (HTTP ${res.status})`,
        false,
        `HTTP_${res.status}`,
      );
    }
    const json = (await res.json()) as { data?: { token?: string } };
    const token = json.data?.token;
    if (!token) throw new SmsProviderError('Eskiz authentication returned no token', false);
    await this.redis.set(TOKEN_CACHE_KEY, token, 'EX', TOKEN_TTL_SECONDS);
    return token;
  }

  private async token(forceRefresh = false): Promise<string> {
    if (!forceRefresh) {
      const cached = await this.redis.get(TOKEN_CACHE_KEY);
      if (cached) return cached;
    }
    return this.login();
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(`${this.env.ESKIZ_BASE_URL}${path}`, {
        ...init,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new SmsProviderError(
        `Eskiz request failed: ${(err as Error).message}`,
        true,
        'NETWORK',
      );
    }
  }

  async send(req: SmsSendRequest): Promise<SmsSendResult> {
    if (!this.isConfigured())
      throw new SmsProviderError('Eskiz credentials are not configured', false, 'NOT_CONFIGURED');
    const doSend = async (token: string): Promise<Response> => {
      const form = new FormData();
      form.set('mobile_phone', req.to.replace(/^\+/, ''));
      form.set('message', req.text);
      form.set('from', this.env.ESKIZ_FROM);
      if (this.env.SMS_CALLBACK_SECRET) {
        form.set(
          'callback_url',
          `${this.env.API_PUBLIC_URL}/v1/webhooks/sms/eskiz?secret=${encodeURIComponent(this.env.SMS_CALLBACK_SECRET)}`,
        );
      }
      return this.request('/message/sms/send', {
        method: 'POST',
        body: form,
        headers: { Authorization: `Bearer ${token}` },
      });
    };

    let res = await doSend(await this.token());
    if (res.status === 401) {
      this.logger.warn('Eskiz token rejected, re-authenticating');
      res = await doSend(await this.token(true));
    }
    const text = await res.text();
    let json: { id?: string; status?: string; message?: string } = {};
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      /* non-JSON body handled below */
    }
    if (!res.ok) {
      const retryable = res.status >= 500 || res.status === 429;
      throw new SmsProviderError(
        `Eskiz rejected the message (HTTP ${res.status}): ${(json.message ?? text).slice(0, 200)}`,
        retryable,
        `HTTP_${res.status}`,
      );
    }
    if (json.status && json.status !== 'waiting' && json.status !== 'success') {
      throw new SmsProviderError(`Eskiz returned status "${json.status}"`, false, json.status);
    }
    return { providerMessageId: json.id ?? null, accepted: true };
  }
}

/** Maps Eskiz delivery report status to our status. */
export function mapEskizStatus(status: string | undefined): 'DELIVERED' | 'FAILED' | 'SENT' {
  const s = (status ?? '').toUpperCase();
  if (s === 'DELIVRD' || s === 'DELIVERED') return 'DELIVERED';
  if (['UNDELIV', 'UNDELIVERED', 'EXPIRED', 'REJECTD', 'REJECTED', 'FAILED'].includes(s))
    return 'FAILED';
  return 'SENT';
}
