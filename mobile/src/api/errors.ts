import type { TFunction } from 'i18next';
import { AxiosError } from 'axios';
import type { ApiErrorBody } from '@moshina/api-types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    for (const d of this.details as { field?: string; messages?: string[] }[]) {
      if (d.field && d.messages?.[0]) out[d.field] = d.messages[0];
    }
    return out;
  }

  get retryAfterSeconds(): number | null {
    const d = this.details as { retryAfterSeconds?: number } | undefined;
    return typeof d?.retryAfterSeconds === 'number' ? d.retryAfterSeconds : null;
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof AxiosError) {
    if (err.response) {
      const body = err.response.data as Partial<ApiErrorBody> | undefined;
      return new ApiError(err.response.status, body?.code ?? `HTTP_${err.response.status}`, body?.message ?? err.message, body?.details);
    }
    if (err.code === 'ECONNABORTED') return new ApiError(0, 'TIMEOUT', 'Request timed out');
    return new ApiError(0, 'NETWORK', 'Network error');
  }
  return new ApiError(0, 'UNKNOWN', err instanceof Error ? err.message : 'Unknown error');
}

const KNOWN = new Set([
  'NETWORK',
  'TIMEOUT',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'OTP_ATTEMPTS_EXCEEDED',
  'OTP_RESEND_COOLDOWN',
  'OTP_LIMIT_EXCEEDED',
  'SMS_SEND_FAILED',
  'SMS_NOT_CONFIGURED',
  'PHONE_INVALID',
  'ACCOUNT_RESTRICTED',
  'MILEAGE_DECREASE',
  'FILE_INVALID',
  'LIMIT_REACHED',
  'RATE_LIMITED',
  'CONFLICT',
  'NOT_FOUND',
  'REFRESH_TOKEN_INVALID',
  'REFRESH_TOKEN_REUSED',
  'UNAUTHORIZED',
]);

/** Human-readable, translated message for any error. */
export function errorMessage(t: TFunction, err: unknown): string {
  const e = toApiError(err);
  if (e.code === 'OTP_INVALID' && typeof (e.details as { attemptsRemaining?: number })?.attemptsRemaining === 'number') {
    return t('errors.OTP_INVALID_REMAINING', { count: (e.details as { attemptsRemaining: number }).attemptsRemaining });
  }
  if ((e.code === 'OTP_RESEND_COOLDOWN' || e.code === 'RATE_LIMITED') && e.retryAfterSeconds) {
    return t('errors.retryAfter', { seconds: e.retryAfterSeconds });
  }
  if (KNOWN.has(e.code)) return t(`errors.${e.code}`);
  if (e.code === 'VALIDATION_FAILED') return t('errors.VALIDATION_FAILED');
  if (e.status >= 500) return t('errors.server');
  return t('errors.generic');
}
