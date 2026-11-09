import { addDays } from '@moshina/shared';
import { ReminderEngineService } from '../src/notifications/reminder-engine.service';
import { createTestApp, createVehicle, daysAgo, login, serviceTypeId, type TestContext } from './helpers';

/** 10:00 Tashkent on a given Tashkent calendar date. */
const at = (date: string) => new Date(`${date}T05:00:00Z`);

describe('Reminder cadence over time', () => {
  let ctx: TestContext;
  let engine: ReminderEngineService;
  beforeAll(async () => {
    ctx = await createTestApp();
    engine = ctx.app.get(ReminderEngineService);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('progresses UPCOMING → DUE → OVERDUE once each, then repeats OVERDUE every 7 days only', async () => {
    const user = await login(ctx);
    const v = await createVehicle(ctx, user, { currentMileage: 50000 });
    const oil = await serviceTypeId(ctx, 'ENGINE_OIL');
    const today = daysAgo(0);
    // Due in 10 days (date-only interval).
    await ctx.http().post('/v1/schedules').set(user.auth).send({ vehicleId: v.id, serviceTypeId: oil, lastServiceDate: daysAgo(170), lastServiceMileage: 49000, intervalDays: 180 }).expect(201);
    const due = addDays(today, 10);
    const types = async () => (await ctx.prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } })).map((n) => n.type);

    for (const d of [today, addDays(today, 1), addDays(today, 5)]) await engine.run(at(d));
    expect(await types()).toEqual(['MAINTENANCE_UPCOMING']);

    await engine.run(at(due));
    await engine.run(at(addDays(due, 3)));
    expect(await types()).toEqual(['MAINTENANCE_UPCOMING', 'MAINTENANCE_DUE']);

    // Overdue from due+7; repeats on 7-day buckets, never twice in one bucket.
    for (let i = 7; i <= 30; i++) {
      await engine.run(at(addDays(due, i)));
      await engine.run(at(addDays(due, i)));
    }
    const overdue = (await types()).filter((t) => t === 'MAINTENANCE_OVERDUE').length;
    expect(overdue).toBeGreaterThanOrEqual(3);
    expect(overdue).toBeLessThanOrEqual(5);
  });

  it('respects the send window (no reminders at night in Tashkent)', async () => {
    const user = await login(ctx);
    const v = await createVehicle(ctx, user, { currentMileage: 50000 });
    const oil = await serviceTypeId(ctx, 'ENGINE_OIL');
    await ctx.http().post('/v1/schedules').set(user.auth).send({ vehicleId: v.id, serviceTypeId: oil, lastServiceDate: daysAgo(200), lastServiceMileage: 42000, intervalDays: 180 }).expect(201);
    const night = new Date(`${daysAgo(0)}T18:30:00Z`); // 23:30 Tashkent
    expect((await engine.run(night)).skipped).toBe('outside_send_window');
    expect(await ctx.prisma.notification.count({ where: { userId: user.id } })).toBe(0);
  });

  it('changing the interval recomputes the due date and starts a new reminder cycle', async () => {
    const user = await login(ctx);
    const v = await createVehicle(ctx, user, { currentMileage: 50000 });
    const oil = await serviceTypeId(ctx, 'ENGINE_OIL');
    const s = await ctx.http().post('/v1/schedules').set(user.auth).send({ vehicleId: v.id, serviceTypeId: oil, lastServiceDate: daysAgo(100), lastServiceMileage: 45000, intervalDays: 100, intervalKm: 20000 }).expect(201);
    expect(s.body.computed.status).toBe('DUE');
    await engine.run(new Date(), { ignoreSendWindow: true });
    const extended = await ctx.http().patch(`/v1/schedules/${s.body.id}`).set(user.auth).send({ intervalDays: 365 }).expect(200);
    expect(extended.body).toMatchObject({ nextDueDate: addDays(daysAgo(100), 365), nextDueMileage: 65000 });
    expect(extended.body.computed.status).toBe('OK');
    await engine.run(new Date(), { ignoreSendWindow: true });
    expect(await ctx.prisma.notification.count({ where: { userId: user.id } })).toBe(1);

    // Removing both intervals is rejected (a schedule must have one).
    await ctx.http().patch(`/v1/schedules/${s.body.id}`).set(user.auth).send({ intervalDays: null, intervalKm: null }).expect(400);
  });

  it('paused schedules and restricted users get no reminders', async () => {
    const user = await login(ctx);
    const v = await createVehicle(ctx, user, { currentMileage: 50000 });
    const oil = await serviceTypeId(ctx, 'ENGINE_OIL');
    const s = await ctx.http().post('/v1/schedules').set(user.auth).send({ vehicleId: v.id, serviceTypeId: oil, lastServiceDate: daysAgo(200), lastServiceMileage: 42000, intervalDays: 180 }).expect(201);
    await ctx.http().patch(`/v1/schedules/${s.body.id}`).set(user.auth).send({ isActive: false }).expect(200);
    await engine.run(new Date(), { ignoreSendWindow: true });
    expect(await ctx.prisma.notification.count({ where: { userId: user.id } })).toBe(0);
    await ctx.http().patch(`/v1/schedules/${s.body.id}`).set(user.auth).send({ isActive: true }).expect(200);
    await ctx.prisma.user.update({ where: { id: user.id }, data: { status: 'RESTRICTED' } });
    await engine.run(new Date(), { ignoreSendWindow: true });
    expect(await ctx.prisma.notification.count({ where: { userId: user.id } })).toBe(0);
  });
});
