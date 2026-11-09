import { createTestApp, createVehicle, daysAgo, login, randomIp, randomPhone, serviceTypeId, type TestContext } from './helpers';
import { MAX_VEHICLES_PER_USER } from '../src/vehicles/vehicles.service';

describe('Concurrency and duplicate operations', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('parallel verification of the same OTP authenticates at most once', async () => {
    const phone = randomPhone();
    const ip = randomIp();
    await ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', ip).send({ phone }).expect(200);
    const code = ctx.sms.lastCodeFor(phone);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => ctx.http().post('/v1/auth/otp/verify').set('X-Forwarded-For', randomIp()).send({ phone, code })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await ctx.prisma.user.count({ where: { phone } })).toBe(1);
    expect(await ctx.prisma.refreshToken.count({ where: { user: { phone } } })).toBe(1);
  });

  it('parallel OTP requests for one phone send exactly one SMS', async () => {
    const phone = randomPhone();
    const before = ctx.sms.sent.length;
    const results = await Promise.all(Array.from({ length: 5 }, () => ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', randomIp()).send({ phone })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 429)).toHaveLength(4);
    expect(ctx.sms.sent.length - before).toBe(1);
  });

  it('parallel refresh with the same token yields one new session and no extra active tokens', async () => {
    const user = await login(ctx);
    const results = await Promise.all(Array.from({ length: 4 }, () => ctx.http().post('/v1/auth/refresh').send({ refreshToken: user.refreshToken })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const active = await ctx.prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } });
    expect(active).toBeLessThanOrEqual(1);
  });

  it('double-submitting "mark as done" creates one service record and one expense', async () => {
    const user = await login(ctx);
    const v = await createVehicle(ctx, user, { currentMileage: 60000 });
    const oil = await serviceTypeId(ctx, 'ENGINE_OIL');
    const s = await ctx.http().post('/v1/schedules').set(user.auth).send({ vehicleId: v.id, serviceTypeId: oil, lastServiceDate: daysAgo(200), lastServiceMileage: 52000, intervalDays: 180 }).expect(201);
    const body = { date: daysAgo(0), mileage: 60500, cost: 420000 };
    const results = await Promise.all([0, 1, 2].map(() => ctx.http().post(`/v1/schedules/${s.body.id}/complete`).set(user.auth).send(body)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(await ctx.prisma.maintenanceRecord.count({ where: { scheduleId: s.body.id } })).toBe(1);
    expect(await ctx.prisma.expense.count({ where: { vehicleId: v.id } })).toBe(1);
  });

  it('cannot exceed the vehicle limit with parallel requests', async () => {
    const user = await login(ctx);
    for (let i = 0; i < MAX_VEHICLES_PER_USER - 2; i++) await createVehicle(ctx, user, { registrationNumber: `01 L ${String(100 + i)} AA` });
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => ctx.http().post('/v1/vehicles').set(user.auth).send({ brand: 'Kia', model: 'K5', year: 2022, registrationNumber: `02 P ${200 + i} PP`, fuelType: 'PETROL', currentMileage: 10 })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(await ctx.prisma.vehicle.count({ where: { userId: user.id } })).toBe(MAX_VEHICLES_PER_USER);
  });

  it('parallel reminder engine runs never duplicate notifications', async () => {
    const { ReminderEngineService } = await import('../src/notifications/reminder-engine.service');
    const engine = ctx.app.get(ReminderEngineService);
    const user = await login(ctx);
    const v = await createVehicle(ctx, user, { currentMileage: 50000 });
    const oil = await serviceTypeId(ctx, 'ENGINE_OIL');
    await ctx.http().post('/v1/schedules').set(user.auth).send({ vehicleId: v.id, serviceTypeId: oil, lastServiceDate: daysAgo(200), lastServiceMileage: 42000, intervalDays: 180 }).expect(201);
    await Promise.all([1, 2, 3, 4].map(() => engine.run(new Date(), { ignoreSendWindow: true })));
    expect(await ctx.prisma.notification.count({ where: { userId: user.id } })).toBe(1);
  });
});
