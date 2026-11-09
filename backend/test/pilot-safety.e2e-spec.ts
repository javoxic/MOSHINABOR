import { randomUUID } from 'node:crypto';
import { hashAdminPassword } from '../src/admin/auth/admin-auth.service';
import {
  createTestApp,
  createVehicle,
  login,
  randomIp,
  randomPhone,
  type TestContext,
} from './helpers';

const PASSWORD = 'Pilot-Safety-Passw0rd';

describe('Pilot safety controls', () => {
  let ctx: TestContext;
  let superAuth: { Authorization: string };
  let analystAuth: { Authorization: string };

  async function adminAuth(role: 'SUPER_ADMIN' | 'ANALYST') {
    const r = await ctx.prisma.adminRole.findUniqueOrThrow({ where: { code: role } });
    const a = await ctx.prisma.adminUser.create({
      data: {
        email: `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@moshinabor.test`,
        fullName: role,
        roleId: r.id,
        passwordHash: await hashAdminPassword(PASSWORD),
      },
    });
    const res = await ctx
      .http()
      .post('/v1/admin/auth/login')
      .set('X-Forwarded-For', randomIp())
      .send({ email: a.email, password: PASSWORD })
      .expect(200);
    return { Authorization: `Bearer ${res.body.accessToken}` };
  }
  const setSetting = (key: string, value: unknown) =>
    ctx.http().put(`/v1/admin/settings/${key}`).set(superAuth).send({ value });

  beforeAll(async () => {
    ctx = await createTestApp();
    superAuth = await adminAuth('SUPER_ADMIN');
    analystAuth = await adminAuth('ANALYST');
  });
  afterAll(async () => {
    await setSetting('app.maintenanceMode', false);
    await setSetting('app.maintenanceMessage', '');
    await setSetting('access.registrationMode', 'open');
    await ctx.app.close();
  });

  describe('emergency maintenance mode', () => {
    afterEach(async () => {
      await setSetting('app.maintenanceMode', false).expect(200);
    });

    it('blocks the mobile API with 503 and the configured message, keeps admin/health/config working', async () => {
      const user = await login(ctx);
      await setSetting('app.maintenanceMessage', 'Texnik ishlar olib borilmoqda').expect(200);
      await setSetting('app.maintenanceMode', true).expect(200);

      const blocked = await ctx.http().get('/v1/vehicles').set(user.auth).expect(503);
      expect(blocked.body).toMatchObject({
        code: 'MAINTENANCE_MODE',
        message: 'Texnik ishlar olib borilmoqda',
      });
      await ctx
        .http()
        .post('/v1/auth/otp/request')
        .set('X-Forwarded-For', randomIp())
        .send({ phone: randomPhone() })
        .expect(503);

      await ctx.http().get('/v1/health/ready').expect(200);
      const cfg = await ctx.http().get('/v1/app-config').expect(200);
      expect(cfg.body).toMatchObject({
        maintenanceMode: true,
        maintenanceMessage: 'Texnik ishlar olib borilmoqda',
        deploymentEnvironment: 'development',
      });
      await ctx.http().get('/v1/admin/dashboard/stats').set(superAuth).expect(200);

      await setSetting('app.maintenanceMode', false).expect(200);
      await ctx.http().get('/v1/vehicles').set(user.auth).expect(200);
    });

    it('can only be switched by settings.manage and is audited', async () => {
      await ctx
        .http()
        .put('/v1/admin/settings/app.maintenanceMode')
        .set(analystAuth)
        .send({ value: true })
        .expect(403);
      await setSetting('app.maintenanceMode', 'yes').expect(400);
      await setSetting('app.maintenanceMode', true).expect(200);
      const log = await ctx.prisma.adminAuditLog.findFirstOrThrow({
        where: { action: 'settings.update', entityId: 'app.maintenanceMode' },
        orderBy: { createdAt: 'desc' },
      });
      expect(log.metadata).toMatchObject({ previous: false, value: true });
    });
  });

  describe('pilot allowlist', () => {
    afterEach(async () => {
      await setSetting('access.registrationMode', 'open').expect(200);
    });

    it('rejects invalid modes', async () => {
      await setSetting('access.registrationMode', 'everyone').expect(400);
    });

    it('only invited numbers receive an SMS; existing sessions keep working; removal blocks new sign-ins', async () => {
      const existing = await login(ctx);
      const v = await createVehicle(ctx, existing);
      await setSetting('access.registrationMode', 'allowlist').expect(200);

      const stranger = randomPhone();
      const before = ctx.sms.sent.length;
      const r = await ctx
        .http()
        .post('/v1/auth/otp/request')
        .set('X-Forwarded-For', randomIp())
        .send({ phone: stranger })
        .expect(403);
      expect(r.body.code).toBe('PILOT_ACCESS_ONLY');
      expect(ctx.sms.sent.length).toBe(before); // no SMS cost for uninvited numbers

      // Existing sessions are not cut off by the mode switch.
      await ctx.http().get(`/v1/vehicles/${v.id}`).set(existing.auth).expect(200);

      const invited = randomPhone();
      const inv = await ctx
        .http()
        .post('/v1/admin/access/allowlist')
        .set(superAuth)
        .send({ phone: invited.replace('+998', ''), note: 'Pilot group A' })
        .expect(201);
      expect(inv.body.phone).toBe(invited);
      await ctx
        .http()
        .post('/v1/admin/access/allowlist')
        .set(superAuth)
        .send({ phone: invited })
        .expect(409);
      const user = await login(ctx, invited);
      expect(user.id).toBeDefined();

      // Invitation withdrawn between request and verify: verification is refused.
      const later = randomPhone();
      const inv2 = await ctx
        .http()
        .post('/v1/admin/access/allowlist')
        .set(superAuth)
        .send({ phone: later })
        .expect(201);
      const ip = randomIp();
      await ctx
        .http()
        .post('/v1/auth/otp/request')
        .set('X-Forwarded-For', ip)
        .send({ phone: later })
        .expect(200);
      await ctx
        .http()
        .delete(`/v1/admin/access/allowlist/${inv2.body.id}`)
        .set(superAuth)
        .expect(204);
      await ctx
        .http()
        .post('/v1/auth/otp/verify')
        .set('X-Forwarded-For', ip)
        .send({ phone: later, code: ctx.sms.lastCodeFor(later) })
        .expect(403);

      const audit = await ctx.prisma.adminAuditLog.findMany({
        where: { action: { in: ['access.invite', 'access.uninvite'] } },
      });
      expect(audit.length).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(audit.map((a) => a.metadata))).not.toContain(invited); // phones masked in audit metadata
    });

    it('analysts see masked invitations and cannot manage them', async () => {
      const phone = randomPhone();
      await ctx
        .http()
        .post('/v1/admin/access/allowlist')
        .set(superAuth)
        .send({ phone })
        .expect(201);
      const list = await ctx
        .http()
        .get('/v1/admin/access/allowlist?pageSize=100')
        .set(analystAuth)
        .expect(200);
      expect(list.body.items.some((i: { phone: string }) => i.phone === phone)).toBe(false);
      expect(list.body.items[0].phone).toContain('*');
      await ctx
        .http()
        .post('/v1/admin/access/allowlist')
        .set(analystAuth)
        .send({ phone: randomPhone() })
        .expect(403);
    });

    it('open mode lets anyone sign in again', async () => {
      await login(ctx, randomPhone());
    });
  });
});
