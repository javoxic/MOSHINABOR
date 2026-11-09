// Environment for e2e tests: isolated database and Redis DB index.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://moshina:moshina_dev@localhost:5432/moshina_bor_test?schema=public';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdefghijklmnop';
process.env.JWT_ADMIN_SECRET = 'test-admin-secret-0123456789abcdefghijklmnopq';
process.env.OTP_PEPPER = 'test-otp-pepper-0123456789abcdefghijklmnopqrs';
process.env.SMS_PROVIDER = 'eskiz'; // real adapter class; the e2e module swaps in a capturing test double
process.env.SMS_CALLBACK_SECRET = 'test-callback-secret-0123456789';
process.env.API_PUBLIC_URL = 'http://localhost:3000';
process.env.STORAGE_DIR = './storage-test';
process.env.LOG_LEVEL = 'error';
process.env.SWAGGER_ENABLED = 'false';
process.env.CORS_ORIGINS = 'http://localhost:5173';
