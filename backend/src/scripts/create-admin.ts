/**
 * Creates (or promotes) an administrator from the command line. Credentials are read from
 * environment variables so they never appear in shell history or source control:
 *
 *   ADMIN_EMAIL=ops@example.com ADMIN_NAME="Ops Lead" ADMIN_PASSWORD='...' ADMIN_ROLE=SUPER_ADMIN \
 *     node dist/scripts/create-admin.js
 */
import { PrismaClient } from '@prisma/client';
import { ADMIN_ROLE_CODES, type AdminRoleCode } from '@moshina/shared';
import { hashAdminPassword } from '../admin/auth/admin-auth.service';
import { seed } from './seed';

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,128}$/;

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const fullName = process.env.ADMIN_NAME?.trim() || 'Administrator';
  const password = process.env.ADMIN_PASSWORD;
  const roleCode = (process.env.ADMIN_ROLE ?? 'SUPER_ADMIN') as AdminRoleCode;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new Error('ADMIN_EMAIL must be a valid email');
  if (!password || !PASSWORD_RULE.test(password)) {
    throw new Error(
      'ADMIN_PASSWORD must be 12-128 chars with upper- and lowercase letters and a digit',
    );
  }
  if (!ADMIN_ROLE_CODES.includes(roleCode))
    throw new Error(`ADMIN_ROLE must be one of ${ADMIN_ROLE_CODES.join(', ')}`);

  const prisma = new PrismaClient();
  try {
    await seed(prisma);
    const role = await prisma.adminRole.findUniqueOrThrow({ where: { code: roleCode } });
    const passwordHash = await hashAdminPassword(password);
    const admin = await prisma.adminUser.upsert({
      where: { email },
      create: { email, fullName, passwordHash, roleId: role.id },
      update: {
        fullName,
        passwordHash,
        roleId: role.id,
        isActive: true,
        failedAttempts: 0,
        lockedUntil: null,
        passwordChangedAt: new Date(),
      },
    });
    await prisma.adminAuditLog.create({
      data: {
        action: 'admins.cli_upsert',
        entityType: 'admin',
        entityId: admin.id,
        metadata: { email, role: roleCode },
      },
    });
    console.log(`Administrator ${email} is ready with role ${roleCode}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
