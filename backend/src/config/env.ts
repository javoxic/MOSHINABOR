import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const csv = z.string().transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const otpTemplate = z
  .string()
  .max(300)
  .refine((v) => v.includes('{code}'), {
    message: 'OTP SMS template must contain the {code} placeholder',
  });

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    PROCESS_ROLE: z.enum(['all', 'api', 'worker']).default('all'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),
    /** Defaults to enabled outside production and disabled in production (see loadEnv). */
    SWAGGER_ENABLED: bool.optional(),
    /** Requests per minute per authenticated user (or per IP for anonymous requests). */
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(100_000).default(120),
    API_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
    CORS_ORIGINS: csv.prefault('http://localhost:5173'),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_ADMIN_SECRET: z.string().min(32, 'JWT_ADMIN_SECRET must be at least 32 characters'),
    OTP_PEPPER: z.string().min(32, 'OTP_PEPPER must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(60),
    ADMIN_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),

    OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(15).max(600).default(60),
    OTP_MAX_PER_PHONE_PER_HOUR: z.coerce.number().int().min(1).default(5),
    OTP_MAX_PER_PHONE_PER_DAY: z.coerce.number().int().min(1).default(10),
    // Mobile carriers in Uzbekistan use carrier-grade NAT: many subscribers share one IP.
    // Per-phone limits are the primary SMS-abuse control; the per-IP limit is a coarse backstop.
    OTP_MAX_PER_IP_PER_HOUR: z.coerce.number().int().min(1).default(60),

    SMS_PROVIDER: z.enum(['eskiz', 'twilio', 'log']).default('eskiz'),
    /** Optional provider used for non-Uzbek (+998) numbers. Empty = international numbers are rejected. */
    SMS_INTERNATIONAL_PROVIDER: z.enum(['twilio', 'none']).default('none'),
    SMS_OTP_TEMPLATE_UZ: otpTemplate.default(
      'MOSHINA BOR: tasdiqlash kodi {code}. Kodni hech kimga bermang.',
    ),
    SMS_OTP_TEMPLATE_RU: otpTemplate.default(
      'MOSHINA BOR: код подтверждения {code}. Никому не сообщайте код.',
    ),
    SMS_OTP_TEMPLATE_EN: otpTemplate.default(
      'MOSHINA BOR: your verification code is {code}. Do not share it.',
    ),
    SMS_CALLBACK_SECRET: z.string().optional(),
    ESKIZ_BASE_URL: z.string().url().default('https://notify.eskiz.uz/api'),
    ESKIZ_EMAIL: z.string().optional(),
    ESKIZ_PASSWORD: z.string().optional(),
    ESKIZ_FROM: z.string().default('4546'),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM: z.string().optional(),
    TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),

    EXPO_ACCESS_TOKEN: z.string().optional(),

    STORAGE_DIR: z.string().default('./storage'),
    /** Per-IP limit for POST /v1/admin/auth/login (account lockout after 5 failures applies independently). */
    RATE_LIMIT_ADMIN_LOGIN_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(10),
    /** Label of this deployment (shown in admin and health). Required in production builds of staging. */
    DEPLOYMENT_ENVIRONMENT: z.enum(['production', 'staging', 'development']).optional(),
    ACCOUNT_DELETION_GRACE_DAYS: z.coerce.number().int().min(0).max(90).default(30),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.SMS_PROVIDER === 'log') {
        ctx.addIssue({
          code: 'custom',
          path: ['SMS_PROVIDER'],
          message: 'The "log" SMS provider is not allowed in production',
        });
      }
      if (!env.SMS_CALLBACK_SECRET || env.SMS_CALLBACK_SECRET.length < 24) {
        ctx.addIssue({
          code: 'custom',
          path: ['SMS_CALLBACK_SECRET'],
          message: 'Required in production (min 24 chars)',
        });
      }
      if (env.CORS_ORIGINS.some((o) => o === '*')) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: 'Wildcard CORS is not allowed in production',
        });
      }
      const secrets = [env.JWT_ACCESS_SECRET, env.JWT_ADMIN_SECRET, env.OTP_PEPPER];
      for (const [name, value] of [
        ['JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET],
        ['JWT_ADMIN_SECRET', env.JWT_ADMIN_SECRET],
        ['OTP_PEPPER', env.OTP_PEPPER],
        ['SMS_CALLBACK_SECRET', env.SMS_CALLBACK_SECRET ?? ''],
      ] as const) {
        if (
          /^(test|e2e|dev|example|changeme|change_me)[-_]/i.test(value) ||
          /CHANGE_?ME/i.test(value)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: 'Looks like a test/placeholder value; generate a real secret for production',
          });
        }
      }
      if (new Set(secrets).size !== secrets.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['JWT_ACCESS_SECRET'],
          message: 'JWT_ACCESS_SECRET, JWT_ADMIN_SECRET and OTP_PEPPER must differ',
        });
      }
    }
  });

export type Env = Omit<z.infer<typeof envSchema>, 'SWAGGER_ENABLED' | 'DEPLOYMENT_ENVIRONMENT'> & {
  SWAGGER_ENABLED: boolean;
  DEPLOYMENT_ENVIRONMENT: 'production' | 'staging' | 'development';
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Empty values (e.g. "FOO=" in .env files or "${FOO:-}" in compose) mean "not set".
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ''),
  );
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return {
    ...parsed.data,
    SWAGGER_ENABLED: parsed.data.SWAGGER_ENABLED ?? parsed.data.NODE_ENV !== 'production',
    DEPLOYMENT_ENVIRONMENT:
      parsed.data.DEPLOYMENT_ENVIRONMENT ??
      (parsed.data.NODE_ENV === 'production' ? 'production' : 'development'),
  };
}
