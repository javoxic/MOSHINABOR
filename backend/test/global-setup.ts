import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Prepares the dedicated e2e test database: applies migrations (non-destructive `migrate deploy`)
 * and empties all data tables. Refuses to run unless the database name ends with "_test".
 */
export default async function globalSetup(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./env-setup');
  const url = new URL(process.env.DATABASE_URL as string);
  const dbName = url.pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to run e2e tests against "${dbName}": the test database name must end with "_test"`);
  }
  execSync('npx prisma migrate deploy', { cwd: join(__dirname, '..'), env: { ...process.env, CI: 'true' }, stdio: 'pipe' });

  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"public"."${t.tablename}"`).join(', ')} CASCADE`);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { seed } = require('../src/scripts/seed') as typeof import('../src/scripts/seed');
  await seed(prisma);
  await prisma.$disconnect();

  const redis = new Redis(process.env.REDIS_URL as string);
  await redis.flushdb();
  await redis.quit();
  rmSync(join(__dirname, '..', 'storage-test'), { recursive: true, force: true });
}
