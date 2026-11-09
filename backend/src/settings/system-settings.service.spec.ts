import { SystemSettingsService } from './system-settings.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env';

function service(
  environment: Env['DEPLOYMENT_ENVIRONMENT'],
  rows: { key: string; value: unknown }[] = [],
) {
  const prisma = {
    systemSetting: {
      findMany: jest.fn().mockResolvedValue(rows.map((r) => ({ ...r, updatedAt: new Date(0) }))),
    },
  } as unknown as PrismaService;
  return new SystemSettingsService(prisma, { DEPLOYMENT_ENVIRONMENT: environment } as Env);
}

describe('SystemSettingsService registration-mode default', () => {
  it('starts a fresh staging deployment invite-only', async () => {
    await expect(service('staging').get('access.registrationMode')).resolves.toBe('allowlist');
    const listed = await service('staging').list();
    expect(listed.find((s) => s.key === 'access.registrationMode')?.value).toBe('allowlist');
  });

  it('keeps open registration as the production and development default', async () => {
    await expect(service('production').get('access.registrationMode')).resolves.toBe('open');
    await expect(service('development').get('access.registrationMode')).resolves.toBe('open');
  });

  it('respects an explicit administrator decision on staging', async () => {
    const s = service('staging', [{ key: 'access.registrationMode', value: 'open' }]);
    await expect(s.get('access.registrationMode')).resolves.toBe('open');
  });
});
