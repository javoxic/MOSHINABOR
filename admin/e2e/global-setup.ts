import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ADMINS, PASSWORD, USERS } from './fixtures';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../backend');

/** Resets the dedicated e2e database and loads deterministic fixtures through Prisma. */
export default async function globalSetup(): Promise<void> {
  const url = process.env.E2E_DATABASE_URL ?? 'postgresql://moshina:moshina_dev@localhost:5432/moshina_bor_e2e?schema=public';
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_e2e')) throw new Error(`Refusing to reset "${dbName}": e2e database name must end with "_e2e"`);

  execSync('npx prisma migrate deploy', { cwd: backendDir, env: { ...process.env, DATABASE_URL: url, CI: 'true' }, stdio: 'pipe' });

  const { PrismaClient } = require(path.join(backendDir, '../node_modules/@prisma/client')) as typeof import('@prisma/client');
  const { seed } = require(path.join(backendDir, 'dist/scripts/seed.js')) as { seed: (p: unknown) => Promise<void> };
  const { hashAdminPassword } = require(path.join(backendDir, 'dist/admin/auth/admin-auth.service.js')) as { hashAdminPassword: (p: string) => Promise<string> };

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
    if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"public"."${t.tablename}"`).join(', ')} CASCADE`);
    await seed(prisma);

    const hash = await hashAdminPassword(PASSWORD);
    for (const a of Object.values(ADMINS)) {
      const role = await prisma.adminRole.findUniqueOrThrow({ where: { code: a.role } });
      await prisma.adminUser.create({ data: { email: a.email, fullName: a.name, passwordHash: hash, roleId: role.id } });
    }

    const oil = await prisma.serviceType.findFirstOrThrow({ where: { code: 'ENGINE_OIL', ownerUserId: null } });
    for (const u of USERS) {
      const user = await prisma.user.create({
        data: { phone: u.phone, fullName: u.fullName, lastActiveAt: new Date(), settings: { create: { language: u.language } } },
      });
      for (const v of u.vehicles) {
        const vehicle = await prisma.vehicle.create({
          data: { userId: user.id, brand: v.brand, model: v.model, year: v.year, registrationNumber: v.plate, fuelType: v.fuel, currentMileage: v.km, mileageUpdatedAt: new Date() },
        });
        await prisma.maintenanceRecord.create({
          data: { userId: user.id, vehicleId: vehicle.id, serviceTypeId: oil.id, serviceDate: new Date(Date.now() - 30 * 86_400_000), mileage: v.km - 500, cost: 350000 },
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
