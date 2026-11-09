import { randomUUID } from 'node:crypto';
import type { AdminRoleCode } from '@moshina/shared';
import { hashAdminPassword } from '../src/admin/auth/admin-auth.service';
import { createTestApp, createVehicle, login, randomIp, type TestContext } from './helpers';

const PASSWORD = 'Correct-Horse-9-Battery';

describe('Admin API', () => {
  let ctx: TestContext;

  async function createAdmin(role: AdminRoleCode, isActive = true) {
    const r = await ctx.prisma.adminRole.findUniqueOrThrow({ where: { code: role } });
    return ctx.prisma.adminUser.create({
      data: { email: `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@moshinabor.test`, fullName: role, passwordHash: await hashAdminPassword(PASSWORD), roleId: r.id, isActive },
    });
  }

  async function adminLogin(role: AdminRoleCode) {
    const admin = await createAdmin(role);
    const res = await ctx.http().post('/v1/admin/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: PASSWORD }).expect(200);
    return { admin, auth: { Authorization: `Bearer ${res.body.accessToken}` }, cookie: res.headers['set-cookie'] as unknown as string[], body: res.body };
  }

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('logs in with an httpOnly SameSite=Strict refresh cookie and returns permissions', async () => {
    const { body, cookie } = await adminLogin('ANALYST');
    expect(body.admin.permissions).toEqual(['dashboard.view', 'maintenance.view', 'notifications.view', 'users.view', 'vehicles.view']);
    expect(body).not.toHaveProperty('refreshToken');
    const c = cookie.find((x) => x.startsWith('mb_admin_rt='));
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Strict/);
    expect(c).toMatch(/Path=\/v1\/admin\/auth/);
  });

  it('rejects wrong passwords generically and locks after 5 failures', async () => {
    const admin = await createAdmin('SUPPORT');
    const ip = randomIp();
    for (let i = 0; i < 5; i++) {
      const r = await ctx.http().post('/v1/admin/auth/login').set('X-Forwarded-For', ip).send({ email: admin.email, password: 'wrong-password' }).expect(401);
      expect(r.body.code).toBe('INVALID_CREDENTIALS');
    }
    const locked = await ctx.http().post('/v1/admin/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: PASSWORD }).expect(429);
    expect(locked.body.code).toBe('ADMIN_LOCKED');
    const unknown = await ctx.http().post('/v1/admin/auth/login').set('X-Forwarded-For', randomIp()).send({ email: 'nobody@moshinabor.test', password: PASSWORD }).expect(401);
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
    expect(await ctx.prisma.adminAuditLog.count({ where: { action: 'auth.login_failed' } })).toBeGreaterThanOrEqual(6);
  });

  it('refuses disabled administrators', async () => {
    const admin = await createAdmin('SUPPORT', false);
    await ctx.http().post('/v1/admin/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: PASSWORD }).expect(403);
  });

  it('rotates the refresh cookie only with the CSRF header and detects reuse', async () => {
    const { cookie } = await adminLogin('SUPPORT');
    const rt = cookie.find((x) => x.startsWith('mb_admin_rt='))?.split(';')[0] as string;
    await ctx.http().post('/v1/admin/auth/refresh').set('Cookie', rt).expect(403);
    const ok = await ctx.http().post('/v1/admin/auth/refresh').set('Cookie', rt).set('X-Requested-With', 'moshina-admin').expect(200);
    const next = (ok.headers['set-cookie'] as unknown as string[]).find((x) => x.startsWith('mb_admin_rt='))?.split(';')[0] as string;
    expect(next).not.toBe(rt);
    // Replay of the old cookie revokes the family, including the new one.
    await ctx.http().post('/v1/admin/auth/refresh').set('Cookie', rt).set('X-Requested-With', 'moshina-admin').expect(401);
    await ctx.http().post('/v1/admin/auth/refresh').set('Cookie', next).set('X-Requested-With', 'moshina-admin').expect(401);
  });

  it('logout revokes the session', async () => {
    const { auth, cookie } = await adminLogin('ANALYST');
    const rt = cookie.find((x) => x.startsWith('mb_admin_rt='))?.split(';')[0] as string;
    await ctx.http().post('/v1/admin/auth/logout').set('Cookie', rt).set('X-Requested-With', 'moshina-admin').expect(204);
    await ctx.http().get('/v1/admin/auth/me').set(auth).expect(401);
  });

  describe('role-based access', () => {
    it('analyst sees statistics and masked phones but cannot manage', async () => {
      const user = await login(ctx);
      await createVehicle(ctx, user);
      const { auth } = await adminLogin('ANALYST');
      const stats = await ctx.http().get('/v1/admin/dashboard/stats').set(auth).expect(200);
      expect(stats.body.totals.users).toBeGreaterThan(0);
      expect(stats.body.registrationsByDay).toHaveLength(30);
      expect(stats.body.recordsByMonth).toHaveLength(12);

      const users = await ctx.http().get('/v1/admin/users?pageSize=100').set(auth).expect(200);
      const row = users.body.items.find((u: { id: string }) => u.id === user.id);
      expect(row.phone).not.toBe(user.phone);
      expect(row.phone).toContain('*');
      // Phone search requires PII permission.
      const search = await ctx.http().get(`/v1/admin/users?q=${user.phone.slice(-7)}`).set(auth).expect(200);
      expect(search.body.items.find((u: { id: string }) => u.id === user.id)).toBeUndefined();

      await ctx.http().post(`/v1/admin/users/${user.id}/restrict`).set(auth).send({ reason: 'test' }).expect(403);
      await ctx.http().get('/v1/admin/admins').set(auth).expect(403);
      await ctx.http().get('/v1/admin/audit-logs').set(auth).expect(403);
      await ctx.http().get('/v1/admin/settings').set(auth).expect(403);
      await ctx.http().put('/v1/admin/notifications/templates/MAINTENANCE_DUE').set(auth).send({}).expect(403);
    });

    it('support sees full phones (audited) and can restrict users, which signs them out', async () => {
      const user = await login(ctx);
      const { auth, admin } = await adminLogin('SUPPORT');
      const search = await ctx.http().get(`/v1/admin/users?q=${user.phone.slice(-7)}`).set(auth).expect(200);
      expect(search.body.items[0].phone).toBe(user.phone);
      expect(await ctx.prisma.adminAuditLog.count({ where: { adminUserId: admin.id, action: 'users.search_pii' } })).toBe(1);
      const detail = await ctx.http().get(`/v1/admin/users/${user.id}`).set(auth).expect(200);
      expect(detail.body.phone).toBe(user.phone);
      expect(detail.body.activeSessions).toBe(1);
      expect(detail.body).not.toHaveProperty('refreshTokens');
      expect(await ctx.prisma.adminAuditLog.count({ where: { adminUserId: admin.id, action: 'users.view_pii', entityId: user.id } })).toBe(1);

      await ctx.http().post(`/v1/admin/users/${user.id}/restrict`).set(auth).send({ reason: 'Fraud report #123' }).expect(200);
      await ctx.http().get('/v1/me').set(user.auth).expect(401);
      const log = await ctx.prisma.adminAuditLog.findFirstOrThrow({ where: { adminUserId: admin.id, action: 'users.restrict' } });
      expect(log.metadata).toEqual({ reason: 'Fraud report #123' });
      await ctx.http().post(`/v1/admin/users/${user.id}/unrestrict`).set(auth).expect(204);
      const filtered = await ctx.http().get('/v1/admin/users?status=RESTRICTED&pageSize=100').set(auth).expect(200);
      expect(filtered.body.items.find((u: { id: string }) => u.id === user.id)).toBeUndefined();
    });

    it('vehicles list supports search and filters', async () => {
      const user = await login(ctx);
      await createVehicle(ctx, user, { brand: 'Kia', model: 'K5', registrationNumber: '30 Z 999 ZZ', fuelType: 'HYBRID' });
      const { auth } = await adminLogin('ANALYST');
      const byQ = await ctx.http().get('/v1/admin/vehicles?q=999').set(auth).expect(200);
      expect(byQ.body.items[0]).toMatchObject({ brand: 'Kia', registrationNumber: '30 Z 999 ZZ' });
      const byFuel = await ctx.http().get('/v1/admin/vehicles?fuelType=HYBRID').set(auth).expect(200);
      expect(byFuel.body.items.every((v: { fuelType: string }) => v.fuelType === 'HYBRID')).toBe(true);
      const detail = await ctx.http().get(`/v1/admin/vehicles/${byQ.body.items[0].id}`).set(auth).expect(200);
      expect(detail.body.owner.phone).toContain('*');
    });

    it('super admin manages administrators and roles; others cannot escalate', async () => {
      const sa = await adminLogin('SUPER_ADMIN');
      const roles = await ctx.http().get('/v1/admin/roles').set(sa.auth).expect(200);
      const supportRole = roles.body.find((r: { code: string }) => r.code === 'SUPPORT');
      const superRole = roles.body.find((r: { code: string }) => r.code === 'SUPER_ADMIN');

      const weak = await ctx.http().post('/v1/admin/admins').set(sa.auth).send({ email: 'new@moshinabor.test', fullName: 'New', roleId: supportRole.id, password: 'short' }).expect(400);
      expect(weak.body.code).toBe('VALIDATION_FAILED');
      const created = await ctx.http().post('/v1/admin/admins').set(sa.auth).send({ email: `New-${randomUUID().slice(0, 6)}@MoshinaBor.test`, fullName: 'New Support', roleId: supportRole.id, password: PASSWORD }).expect(201);
      expect(created.body.email).toBe(created.body.email.toLowerCase());
      expect(created.body).not.toHaveProperty('passwordHash');

      // Disable → their sessions end.
      const newLogin = await ctx.http().post('/v1/admin/auth/login').set('X-Forwarded-For', randomIp()).send({ email: created.body.email, password: PASSWORD }).expect(200);
      await ctx.http().patch(`/v1/admin/admins/${created.body.id}`).set(sa.auth).send({ isActive: false }).expect(200);
      await ctx.http().get('/v1/admin/auth/me').set({ Authorization: `Bearer ${newLogin.body.accessToken}` }).expect(401);

      await ctx.http().put(`/v1/admin/roles/${superRole.id}`).set(sa.auth).send({ name: 'xx', permissions: ['dashboard.view'] }).expect(403);
      await ctx.http().patch(`/v1/admin/admins/${sa.admin.id}`).set(sa.auth).send({ isActive: false }).expect(403);

      const custom = await ctx.http().post('/v1/admin/roles').set(sa.auth).send({ name: `Auditor ${randomUUID().slice(0, 4)}`, permissions: ['audit.view', 'dashboard.view'] }).expect(201);
      const audit = await ctx.http().get('/v1/admin/audit-logs?action=admins.').set(sa.auth).expect(200);
      expect(audit.body.items.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['admins.create', 'admins.disable']));
      await ctx.http().delete(`/v1/admin/roles/${custom.body.id}`).set(sa.auth).expect(204);

      // An Administrator (no admins.manage) cannot create admins at all.
      const adm = await adminLogin('ADMINISTRATOR');
      await ctx.http().post('/v1/admin/admins').set(adm.auth).send({ email: 'x@moshinabor.test', fullName: 'X', roleId: superRole.id, password: PASSWORD }).expect(403);
    });

    it('a custom role holder cannot grant permissions they lack', async () => {
      const sa = await adminLogin('SUPER_ADMIN');
      const roleRes = await ctx.http().post('/v1/admin/roles').set(sa.auth).send({ name: `Admin managers ${randomUUID().slice(0, 4)}`, permissions: ['admins.view', 'admins.manage'] }).expect(201);
      const manager = await ctx.prisma.adminUser.create({
        data: { email: `mgr-${randomUUID().slice(0, 6)}@moshinabor.test`, fullName: 'Mgr', roleId: roleRes.body.id, passwordHash: await hashAdminPassword(PASSWORD) },
      });
      const l = await ctx.http().post('/v1/admin/auth/login').set('X-Forwarded-For', randomIp()).send({ email: manager.email, password: PASSWORD }).expect(200);
      const superRole = await ctx.prisma.adminRole.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
      const r = await ctx.http().post('/v1/admin/admins').set({ Authorization: `Bearer ${l.body.accessToken}` }).send({ email: `esc-${randomUUID().slice(0, 6)}@moshinabor.test`, fullName: 'Esc', roleId: superRole.id, password: PASSWORD }).expect(403);
      expect(r.body.message).toContain('cannot grant');
    });

    it('settings: view health, update reminder thresholds (audited), reject invalid values', async () => {
      const sa = await adminLogin('SUPER_ADMIN');
      const health = await ctx.http().get('/v1/admin/settings/health').set(sa.auth).expect(200);
      expect(health.body.database.ok).toBe(true);
      expect(health.body.redis.ok).toBe(true);
      expect(health.body.sms).toMatchObject({ provider: 'eskiz', configured: true });
      expect(JSON.stringify(health.body)).not.toMatch(/password|secret|token"/i);
      await ctx.http().put('/v1/admin/settings/reminders.dueSoonDays').set(sa.auth).send({ value: 21 }).expect(200);
      await ctx.http().put('/v1/admin/settings/reminders.dueSoonDays').set(sa.auth).send({ value: -1 }).expect(400);
      await ctx.http().put('/v1/admin/settings/unknown.key').set(sa.auth).send({ value: 1 }).expect(400);
      const list = await ctx.http().get('/v1/admin/settings').set(sa.auth).expect(200);
      expect(list.body.settings.find((s: { key: string }) => s.key === 'reminders.dueSoonDays').value).toBe(21);
      await ctx.http().put('/v1/admin/settings/reminders.dueSoonDays').set(sa.auth).send({ value: 14 }).expect(200);

      const adm = await adminLogin('ADMINISTRATOR');
      await ctx.http().get('/v1/admin/settings').set(adm.auth).expect(200);
      await ctx.http().put('/v1/admin/settings/reminders.dueSoonDays').set(adm.auth).send({ value: 5 }).expect(403);
    });

    it('maintenance categories and templates management', async () => {
      const adm = await adminLogin('ADMINISTRATOR');
      const created = await ctx.http().post('/v1/admin/maintenance/service-types').set(adm.auth).send({ code: `WHEEL_${randomUUID().slice(0, 4).toUpperCase()}`, nameUz: "G'ildirak", nameRu: 'Развал', nameEn: 'Wheel alignment', suggestedIntervalKm: 15000 }).expect(201);
      await ctx.http().put(`/v1/admin/maintenance/service-types/${created.body.id}`).set(adm.auth).send({ code: created.body.code, nameUz: "G'ildirak", nameRu: 'Развал', nameEn: 'Wheel alignment', suggestedIntervalKm: 20000, isActive: false }).expect(200);
      const user = await login(ctx);
      const types = await ctx.http().get('/v1/service-types').set(user.auth).expect(200);
      expect(types.body.find((t: { id: string }) => t.id === created.body.id)).toBeUndefined();

      const templates = await ctx.http().get('/v1/admin/notifications/templates').set(adm.auth).expect(200);
      const due = templates.body.find((t: { code: string }) => t.code === 'MAINTENANCE_DUE');
      expect(due.placeholders).toEqual(['service', 'vehicle', 'date']);
      await ctx.http().put('/v1/admin/notifications/templates/MAINTENANCE_DUE').set(adm.auth).send({ title: due.title, body: due.body, isActive: true }).expect(200);

      const ann = await ctx.http().post('/v1/admin/notifications/announcements').set(adm.auth).send({
        title: { uz: 'Yangilik', ru: 'Новость', en: 'News' },
        body: { uz: 'Matn', ru: 'Текст', en: 'Text' },
        scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
      }).expect(201);
      expect(ann.body.status).toBe('SCHEDULED');
      await ctx.http().post(`/v1/admin/notifications/announcements/${ann.body.id}/cancel`).set(adm.auth).expect(200);
      await ctx.http().post(`/v1/admin/notifications/announcements/${ann.body.id}/cancel`).set(adm.auth).expect(409);
    });
  });
});
