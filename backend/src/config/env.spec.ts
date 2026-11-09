import { loadEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://x',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_ADMIN_SECRET: 'b'.repeat(40),
  OTP_PEPPER: 'c'.repeat(40),
};

describe('environment validation', () => {
  it('applies secure defaults', () => {
    const env = loadEnv(base);
    expect(env.OTP_TTL_SECONDS).toBe(300);
    expect(env.OTP_MAX_ATTEMPTS).toBe(5);
    expect(env.OTP_RESEND_COOLDOWN_SECONDS).toBe(60);
    expect(env.SMS_PROVIDER).toBe('eskiz');
  });

  it('treats empty values as unset so defaults apply', () => {
    const env = loadEnv({ ...base, SMS_OTP_TEMPLATE_UZ: '', ESKIZ_FROM: '  ', SMS_PROVIDER: '' });
    expect(env.SMS_OTP_TEMPLATE_UZ).toContain('{code}');
    expect(env.ESKIZ_FROM).toBe('4546');
    expect(env.SMS_PROVIDER).toBe('eskiz');
  });

  it('requires the {code} placeholder in custom OTP templates', () => {
    expect(() => loadEnv({ ...base, SMS_OTP_TEMPLATE_RU: 'Ваш код' })).toThrow(/\{code\}/);
    expect(loadEnv({ ...base, SMS_OTP_TEMPLATE_RU: 'Код: {code}' }).SMS_OTP_TEMPLATE_RU).toBe('Код: {code}');
  });

  it('disables Swagger by default only in production', () => {
    expect(loadEnv(base).SWAGGER_ENABLED).toBe(true);
    expect(loadEnv({ ...base, NODE_ENV: 'production', SMS_CALLBACK_SECRET: 'x'.repeat(30) }).SWAGGER_ENABLED).toBe(false);
    expect(loadEnv({ ...base, NODE_ENV: 'production', SMS_CALLBACK_SECRET: 'x'.repeat(30), SWAGGER_ENABLED: 'true' }).SWAGGER_ENABLED).toBe(true);
  });

  it('refuses test/placeholder secrets in production', () => {
    const prod = { ...base, NODE_ENV: 'production', SMS_CALLBACK_SECRET: 'x'.repeat(30) };
    expect(() => loadEnv({ ...prod, JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdefghijklmnop' })).toThrow(/test\/placeholder/);
    expect(() => loadEnv({ ...prod, OTP_PEPPER: 'CHANGE_ME_CHANGE_ME_CHANGE_ME_CHANGE_ME' })).toThrow(/test\/placeholder/);
  });

  it('rejects short secrets', () => {
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('forbids the development SMS logger, wildcard CORS and shared secrets in production', () => {
    const prod = { ...base, NODE_ENV: 'production', SMS_CALLBACK_SECRET: 'x'.repeat(30) };
    expect(() => loadEnv({ ...prod, SMS_PROVIDER: 'log' })).toThrow(/not allowed in production/);
    expect(() => loadEnv({ ...prod, CORS_ORIGINS: '*' })).toThrow(/Wildcard/);
    expect(() => loadEnv({ ...prod, JWT_ADMIN_SECRET: base.JWT_ACCESS_SECRET })).toThrow(/must differ/);
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(/SMS_CALLBACK_SECRET/);
    expect(() => loadEnv(prod)).not.toThrow();
  });
});
