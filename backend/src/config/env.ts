import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const csv = z
  .string()
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    PROCESS_ROLE: z.enum(['all', 'api', 'worker']).default('all'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),
    SWAGGER_ENABLED: bool.prefault('true'),
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
    OTP_MAX_PER_IP_PER_HOUR: z.coerce.number().int().min(1).default(20),

    SMS_PROVIDER: z.enum(['eskiz', 'twilio', 'log']).default('eskiz'),
    /** Optional provider used for non-Uzbek (+998) numbers. Empty = international numbers are rejected. */
    SMS_INTERNATIONAL_PROVIDER: z.enum(['twilio', 'none']).default('none'),
    SMS_OTP_TEMPLATE_UZ: z.string().default('MOSHINA BOR: tasdiqlash kodi {code}. Kodni hech kimga bermang.'),
    SMS_OTP_TEMPLATE_RU: z.string().default('MOSHINA BOR: код подтверждения {code}. Никому не сообщайте код.'),
    SMS_OTP_TEMPLATE_EN: z.string().default('MOSHINA BOR: your verification code is {code}. Do not share it.'),
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
    ACCOUNT_DELETION_GRACE_DAYS: z.coerce.number().int().min(0).max(90).default(30),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.SMS_PROVIDER === 'log') {
        ctx.addIssue({ code: 'custom', path: ['SMS_PROVIDER'], message: 'The "log" SMS provider is not allowed in production' });
      }
      if (!env.SMS_CALLBACK_SECRET || env.SMS_CALLBACK_SECRET.length < 24) {
        ctx.addIssue({ code: 'custom', path: ['SMS_CALLBACK_SECRET'], message: 'Required in production (min 24 chars)' });
      }
      if (env.CORS_ORIGINS.some((o) => o === '*')) {
        ctx.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'Wildcard CORS is not allowed in production' });
      }
      const secrets = [env.JWT_ACCESS_SECRET, env.JWT_ADMIN_SECRET, env.OTP_PEPPER];
      if (new Set(secrets).size !== secrets.length) {
        ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'JWT_ACCESS_SECRET, JWT_ADMIN_SECRET and OTP_PEPPER must differ' });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}
