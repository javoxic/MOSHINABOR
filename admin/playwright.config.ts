import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the REAL backend (NestJS + PostgreSQL + Redis) and the production
 * build of the admin app. A dedicated database (name must end with "_e2e") is reset by global setup.
 */
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://moshina:moshina_dev@localhost:5432/moshina_bor_e2e?schema=public';
const API_PORT = Number(process.env.E2E_API_PORT ?? 3100);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../backend/dist/main.js',
      url: `http://localhost:${API_PORT}/v1/health/live`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        DATABASE_URL: E2E_DATABASE_URL,
        REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/14',
        JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789abcdefghijklmnop',
        JWT_ADMIN_SECRET: 'e2e-admin-secret-0123456789abcdefghijklmnopq',
        OTP_PEPPER: 'e2e-otp-pepper-0123456789abcdefghijklmnopqrs',
        SMS_PROVIDER: 'eskiz',
        SWAGGER_ENABLED: 'false',
        LOG_LEVEL: 'warn',
        CORS_ORIGINS: 'http://localhost:4173',
        STORAGE_DIR: '../backend/storage-e2e',
        PROCESS_ROLE: 'api',
        // Many sequential logins from 127.0.0.1 during the suite.
        RATE_LIMIT_ADMIN_LOGIN_PER_MINUTE: '200',
      },
    },
    {
      command: 'npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_DEV_API_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
