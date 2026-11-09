import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { UsersService } from '../src/users/users.service';
import { ReminderEngineService } from '../src/notifications/reminder-engine.service';
import {
  createTestApp,
  createVehicle,
  daysAgo,
  login,
  serviceTypeId,
  type TestContext,
} from './helpers';

describe('Account deletion', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('request → no reminders → cancel restores the account', async () => {
    const user = await login(ctx);
    const v = await createVehicle(ctx, user);
    const oil = await serviceTypeId(ctx, 'ENGINE_OIL');
    await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(300),
        lastServiceMileage: 40000,
        intervalDays: 180,
      })
      .expect(201);
    const r = await ctx.http().post('/v1/me/deletion-request').set(user.auth).expect(200);
    expect(r.body.status).toBe('DELETION_PENDING');
    expect(new Date(r.body.deletionScheduledFor).getTime() - Date.now()).toBeGreaterThan(
      29 * 86_400_000,
    );
    await ctx.app.get(ReminderEngineService).run(new Date(), { ignoreSendWindow: true });
    expect(await ctx.prisma.notification.count({ where: { userId: user.id } })).toBe(0);
    const c = await ctx.http().delete('/v1/me/deletion-request').set(user.auth).expect(200);
    expect(c.body).toMatchObject({ status: 'ACTIVE', deletionScheduledFor: null });
  });

  it('purge permanently deletes all user data and stored files after the grace period only', async () => {
    const user = await login(ctx);
    const other = await login(ctx);
    const v = await createVehicle(ctx, user);
    const otherVehicle = await createVehicle(ctx, other);
    const png = await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    await ctx
      .http()
      .post(`/v1/vehicles/${v.id}/images`)
      .set(user.auth)
      .attach('file', png, 'a.png')
      .expect(201);
    await ctx
      .http()
      .post('/v1/expenses')
      .set(user.auth)
      .send({ vehicleId: v.id, category: 'FUEL', amount: 1000, date: daysAgo(1) })
      .expect(201);
    const file = await ctx.prisma.storedFile.findFirstOrThrow({ where: { ownerUserId: user.id } });
    const blob = join(resolve(process.env.STORAGE_DIR as string), file.storageKey);
    expect(existsSync(blob)).toBe(true);

    await ctx.http().post('/v1/me/deletion-request').set(user.auth).expect(200);
    const users = ctx.app.get(UsersService);
    expect(await users.purgeDueDeletions()).toBe(0); // grace period not over
    await ctx.prisma.user.update({
      where: { id: user.id },
      data: { deletionScheduledAt: new Date(Date.now() - 1000) },
    });
    expect(await users.purgeDueDeletions()).toBeGreaterThanOrEqual(1);

    expect(await ctx.prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await ctx.prisma.vehicle.count({ where: { userId: user.id } })).toBe(0);
    expect(await ctx.prisma.expense.count({ where: { userId: user.id } })).toBe(0);
    expect(await ctx.prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
    expect(await ctx.prisma.storedFile.count({ where: { ownerUserId: user.id } })).toBe(0);
    expect(existsSync(blob)).toBe(false);
    await ctx.http().get('/v1/me').set(user.auth).expect(401);
    // Other users are untouched.
    await ctx.http().get(`/v1/vehicles/${otherVehicle.id}`).set(other.auth).expect(200);
    // The phone number can register again as a new account (after the per-phone resend cooldown).
    await ctx.prisma.smsVerification.updateMany({
      where: { phone: user.phone },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
    const again = await login(ctx, user.phone);
    expect(again.id).not.toBe(user.id);
  });
});
