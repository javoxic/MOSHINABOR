import type { Redis } from 'ioredis';
import { loadEnv, type Env } from '../../config/env';
import { EskizSmsProvider, mapEskizStatus } from './eskiz.provider';
import { TwilioSmsProvider, mapTwilioStatus } from './twilio.provider';
import { SmsProviderError } from '../sms-provider.interface';

const baseEnv = {
  DATABASE_URL: 'postgresql://x',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_ADMIN_SECRET: 'b'.repeat(40),
  OTP_PEPPER: 'c'.repeat(40),
};

function fakeRedis(): Redis {
  const store = new Map<string, string>();
  return {
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
  } as unknown as Redis;
}

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('EskizSmsProvider', () => {
  const env: Env = loadEnv({ ...baseEnv, ESKIZ_EMAIL: 'ops@example.uz', ESKIZ_PASSWORD: 'pw', SMS_CALLBACK_SECRET: 'cb-secret-123456789012345' });

  it('is not configured without credentials', () => {
    const p = new EskizSmsProvider(loadEnv(baseEnv), fakeRedis(), jest.fn());
    expect(p.isConfigured()).toBe(false);
    return expect(p.send({ to: '+998901234567', text: 't', reference: 'r' })).rejects.toBeInstanceOf(SmsProviderError);
  });

  it('logs in, caches the token and sends with the number without "+"', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response(200, { data: { token: 'tok-1' } }))
      .mockResolvedValueOnce(response(200, { id: 'msg-1', status: 'waiting' }))
      .mockResolvedValueOnce(response(200, { id: 'msg-2', status: 'waiting' }));
    const redis = fakeRedis();
    const p = new EskizSmsProvider(env, redis, fetchMock as unknown as typeof fetch);
    await expect(p.send({ to: '+998901234567', text: 'Code 123456', reference: 'r1' })).resolves.toEqual({ providerMessageId: 'msg-1', accepted: true });
    await p.send({ to: '+998901234567', text: 'Code 654321', reference: 'r2' });
    expect(fetchMock).toHaveBeenCalledTimes(3); // login only once
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://notify.eskiz.uz/api/message/sms/send');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
    const form = init.body as FormData;
    expect(form.get('mobile_phone')).toBe('998901234567');
    expect(form.get('from')).toBe('4546');
    expect(String(form.get('callback_url'))).toContain('/v1/webhooks/sms/eskiz?secret=');
  });

  it('re-authenticates once when the cached token is rejected', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response(200, { data: { token: 'old' } }))
      .mockResolvedValueOnce(response(401, { message: 'Expired' }))
      .mockResolvedValueOnce(response(200, { data: { token: 'new' } }))
      .mockResolvedValueOnce(response(200, { id: 'msg', status: 'waiting' }));
    const p = new EskizSmsProvider(env, fakeRedis(), fetchMock as unknown as typeof fetch);
    await expect(p.send({ to: '+998901234567', text: 't', reference: 'r' })).resolves.toMatchObject({ providerMessageId: 'msg' });
    expect(((fetchMock.mock.calls[3] as [string, RequestInit])[1].headers as Record<string, string>).Authorization).toBe('Bearer new');
  });

  it('surfaces provider rejections as errors (never as success)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(response(200, { data: { token: 'tok' } }))
      .mockResolvedValueOnce(response(400, { message: 'Template not approved' }));
    const p = new EskizSmsProvider(env, fakeRedis(), fetchMock as unknown as typeof fetch);
    await expect(p.send({ to: '+998901234567', text: 't', reference: 'r' })).rejects.toThrow(/Template not approved/);
  });

  it('treats network failures as retryable', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const p = new EskizSmsProvider(env, fakeRedis(), fetchMock as unknown as typeof fetch);
    await expect(p.send({ to: '+998901234567', text: 't', reference: 'r' })).rejects.toMatchObject({ retryable: true });
  });

  it('treats provider timeouts as retryable failures (never as success)', async () => {
    const fetchMock = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      expect(init.signal).toBeDefined(); // every call carries a timeout signal
      return Promise.reject(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }));
    });
    const p = new EskizSmsProvider(env, fakeRedis(), fetchMock as unknown as typeof fetch);
    await expect(p.send({ to: '+998901234567', text: 't', reference: 'r' })).rejects.toMatchObject({ retryable: true, providerCode: 'NETWORK' });
  });

  it('maps delivery report statuses', () => {
    expect(mapEskizStatus('DELIVRD')).toBe('DELIVERED');
    expect(mapEskizStatus('UNDELIV')).toBe('FAILED');
    expect(mapEskizStatus('TRANSMTD')).toBe('SENT');
  });
});

describe('TwilioSmsProvider', () => {
  const env = loadEnv({ ...baseEnv, TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'secret', TWILIO_FROM: '+15005550006' });

  it('sends with basic auth and form encoding', async () => {
    const fetchMock = jest.fn().mockResolvedValue(response(201, { sid: 'SM1', status: 'queued' }));
    const p = new TwilioSmsProvider(env, fetchMock as unknown as typeof fetch);
    await expect(p.send({ to: '+14155552671', text: 'hello', reference: 'r' })).resolves.toEqual({ providerMessageId: 'SM1', accepted: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('AC123:secret').toString('base64')}`);
    expect(String(init.body)).toContain('To=%2B14155552671');
  });

  it('fails on API errors', async () => {
    const fetchMock = jest.fn().mockResolvedValue(response(400, { code: 21211, message: "The 'To' number is not valid" }));
    const p = new TwilioSmsProvider(env, fetchMock as unknown as typeof fetch);
    await expect(p.send({ to: '+1', text: 'x', reference: 'r' })).rejects.toMatchObject({ providerCode: '21211', retryable: false });
  });

  it('maps statuses', () => {
    expect(mapTwilioStatus('delivered')).toBe('DELIVERED');
    expect(mapTwilioStatus('undelivered')).toBe('FAILED');
    expect(mapTwilioStatus('sent')).toBe('SENT');
  });
});
