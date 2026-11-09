/**
 * Idempotent reference-data seed: permissions, system roles, maintenance categories,
 * notification templates. Safe to run on every deployment. Creates NO users or admins.
 */
import { PrismaClient } from '@prisma/client';
import {
  ADMIN_PERMISSION_DESCRIPTIONS,
  ADMIN_PERMISSIONS,
  ADMIN_ROLE_CODES,
  ADMIN_ROLE_NAMES,
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_SERVICE_TYPES,
} from '@moshina/shared';
import { DEFAULT_TEMPLATES } from './seed-data';

export async function seed(prisma: PrismaClient): Promise<void> {
  for (const code of ADMIN_PERMISSIONS) {
    await prisma.adminPermission.upsert({
      where: { code },
      create: { code, description: ADMIN_PERMISSION_DESCRIPTIONS[code] },
      update: { description: ADMIN_PERMISSION_DESCRIPTIONS[code] },
    });
  }

  for (const code of ADMIN_ROLE_CODES) {
    const existing = await prisma.adminRole.findUnique({ where: { code } });
    if (!existing) {
      await prisma.adminRole.create({
        data: {
          code,
          name: ADMIN_ROLE_NAMES[code],
          isSystem: true,
          permissions: { create: DEFAULT_ROLE_PERMISSIONS[code].map((p) => ({ permissionCode: p })) },
        },
      });
    } else if (code === 'SUPER_ADMIN') {
      // Super Admin always holds every permission (including ones added in new releases).
      await prisma.adminRolePermission.createMany({
        data: ADMIN_PERMISSIONS.map((p) => ({ roleId: existing.id, permissionCode: p })),
        skipDuplicates: true,
      });
    }
  }

  for (const [i, t] of DEFAULT_SERVICE_TYPES.entries()) {
    const existing = await prisma.serviceType.findFirst({ where: { ownerUserId: null, code: t.code } });
    if (!existing) {
      await prisma.serviceType.create({
        data: {
          code: t.code,
          nameUz: t.nameUz,
          nameRu: t.nameRu,
          nameEn: t.nameEn,
          suggestedIntervalDays: t.suggestedIntervalDays,
          suggestedIntervalKm: t.suggestedIntervalKm,
          icon: t.icon,
          sortOrder: (i + 1) * 10,
        },
      });
    }
  }

  for (const [code, t] of Object.entries(DEFAULT_TEMPLATES)) {
    await prisma.notificationTemplate.upsert({
      where: { code: code as keyof typeof DEFAULT_TEMPLATES },
      create: {
        code: code as keyof typeof DEFAULT_TEMPLATES,
        titleUz: t.title[0],
        titleRu: t.title[1],
        titleEn: t.title[2],
        bodyUz: t.body[0],
        bodyRu: t.body[1],
        bodyEn: t.body[2],
      },
      update: {},
    });
  }
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seed(prisma)
    .then(() => console.log('Reference data seeded.'))
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
}
