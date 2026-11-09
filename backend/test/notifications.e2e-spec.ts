import { ReminderEngineService } from '../src/notifications/reminder-engine.service';
import { PushService } from '../src/notifications/push.service';
import {
  createTestApp,
  createVehicle,
  daysAgo,
  login,
  serviceTypeId,
  type LoggedInUser,
  type TestContext,
} from './helpers';

const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

describe('Reminder engine and notifications', () => {
  let ctx: TestContext;
  let engine: ReminderEngineService;
  let push: PushService;
  let oil: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    engine = ctx.app.get(ReminderEngineService);
    push = ctx.app.get(PushService);
    oil = await serviceTypeId(ctx, 'ENGINE_OIL');
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  async function notificationsOf(user: LoggedInUser) {
    return ctx.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  it('does not send outside the configured send window', async () => {
    // 02:00 Tashkent (21:00 UTC previous day)
    const r = await engine.run(new Date('2026-06-14T21:00:00Z'));
    expect(r.skipped).toBe('outside_send_window');
  });

  it('creates one overdue reminder and suppresses duplicates on re-runs', async () => {
    const user = await login(ctx);
    const v = await createVehicle(ctx, user, { currentMileage: 50000 });
    await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(200),
        lastServiceMileage: 42000,
        intervalDays: 180,
      })
      .expect(201);

    await engine.run(new Date(), { ignoreSendWindow: true });
    await engine.run(new Date(), { ignoreSendWindow: true });
    await engine.run(new Date(), { ignoreSendWindow: true });
    const list = await notificationsOf(user);
    const overdue = list.filter((n) => n.type === 'MAINTENANCE_OVERDUE');
    expect(overdue).toHaveLength(1);
    expect(overdue[0]?.title).toBe('Texnik xizmat kechikmoqda'); // Uzbek default language
    expect(overdue[0]?.body).toContain('Chevrolet Cobalt');

    const api = await ctx.http().get('/v1/notifications').set(user.auth).expect(200);
    expect(api.body.unread).toBeGreaterThanOrEqual(1);
  });

  it('sends a new reminder after the schedule is completed and becomes due again', async () => {
    const user = await login(ctx);
    const v = await createVehicle(ctx, user, { currentMileage: 50000 });
    const s = await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(181),
        lastServiceMileage: 45000,
        intervalDays: 180,
      })
      .expect(201);
    await engine.run(new Date(), { ignoreSendWindow: true });
    expect((await notificationsOf(user)).filter((n) => n.type === 'MAINTENANCE_DUE')).toHaveLength(
      1,
    );

    await ctx
      .http()
      .post(`/v1/schedules/${s.body.id}/complete`)
      .set(user.auth)
      .send({ date: daysAgo(0), mileage: 50100 })
      .expect(200);
    await engine.run(new Date(), { ignoreSendWindow: true });
    expect(
      (await notificationsOf(user)).filter((n) => n.type.startsWith('MAINTENANCE')),
    ).toHaveLength(1);

    // Simulate the new cycle: completed long ago → due again with a different cycle key.
    await ctx
      .http()
      .patch(`/v1/schedules/${s.body.id}`)
      .set(user.auth)
      .send({ lastServiceDate: daysAgo(181) })
      .expect(200);
    await engine.run(new Date(), { ignoreSendWindow: true });
    expect((await notificationsOf(user)).filter((n) => n.type === 'MAINTENANCE_DUE')).toHaveLength(
      2,
    );
  });

  it('uses mileage only when it is fresh, otherwise asks for a mileage update', async () => {
    const user = await login(ctx);
    const v = await createVehicle(ctx, user, { currentMileage: 50000 });
    await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(10),
        lastServiceMileage: 41500,
        intervalKm: 8000,
      })
      .expect(201);

    // Fresh mileage, 500 km past due → overdue by mileage.
    await engine.run(new Date(), { ignoreSendWindow: true });
    let list = await notificationsOf(user);
    expect(list.map((n) => n.type)).toEqual(['MAINTENANCE_OVERDUE']);
    expect((list[0]?.data as Record<string, string>).triggeredBy).toBe('MILEAGE');

    // Another vehicle with stale mileage: no mileage-based reminder, but a mileage update prompt.
    const v2 = await createVehicle(ctx, user, {
      currentMileage: 50000,
      registrationNumber: '01 S 777 SS',
    });
    await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v2.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(10),
        lastServiceMileage: 41500,
        intervalKm: 8000,
      })
      .expect(201);
    await ctx.prisma.vehicle.update({
      where: { id: v2.id },
      data: { mileageUpdatedAt: new Date(Date.now() - 45 * 86_400_000) },
    });
    await engine.run(new Date(), { ignoreSendWindow: true });
    await engine.run(new Date(), { ignoreSendWindow: true });
    list = await notificationsOf(user);
    const forV2 = list.filter((n) => (n.data as Record<string, string>).vehicleId === v2.id);
    expect(forV2.map((n) => n.type)).toEqual(['MILEAGE_UPDATE_REQUIRED']);

    const sched = await ctx
      .http()
      .get(`/v1/schedules?vehicleId=${v2.id}`)
      .set(user.auth)
      .expect(200);
    expect(sched.body[0].computed.mileageStale).toBe(true);
  });

  it('respects notification preferences', async () => {
    const user = await login(ctx);
    await ctx
      .http()
      .put('/v1/me/settings')
      .set(user.auth)
      .send({ maintenanceReminders: false, mileageReminders: false })
      .expect(200);
    const v = await createVehicle(ctx, user, { currentMileage: 50000 });
    await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(400),
        lastServiceMileage: 40000,
        intervalDays: 180,
      })
      .expect(201);
    await engine.run(new Date(), { ignoreSendWindow: true });
    expect(await notificationsOf(user)).toHaveLength(0);
  });

  it('delivers push to registered devices, records tickets, and disables dead tokens', async () => {
    const user = await login(ctx);
    await ctx
      .http()
      .post('/v1/push-devices')
      .set(user.auth)
      .send({ token: TOKEN_A, platform: 'android' })
      .expect(200);
    await ctx
      .http()
      .post('/v1/push-devices')
      .set(user.auth)
      .send({ token: TOKEN_B, platform: 'ios' })
      .expect(200);
    await ctx
      .http()
      .post('/v1/push-devices')
      .set(user.auth)
      .send({ token: 'not-a-token', platform: 'ios' })
      .expect(400);

    const v = await createVehicle(ctx, user, { currentMileage: 50000 });
    await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(200),
        lastServiceMileage: 42000,
        intervalDays: 180,
      })
      .expect(201);
    ctx.expo.nextTickets = (m) =>
      m.to === TOKEN_B
        ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: 'ticket-A' };
    await engine.run(new Date(), { ignoreSendWindow: true });
    const n = (await notificationsOf(user))[0];
    if (!n) throw new Error('expected a notification');
    await push.sendForNotification(n.id);
    await push.sendForNotification(n.id); // idempotent

    const refreshed = await ctx.prisma.notification.findUniqueOrThrow({
      where: { id: n.id },
      include: { deliveries: true },
    });
    expect(refreshed.pushStatus).toBe('SENT');
    expect(refreshed.deliveries).toHaveLength(2);
    expect(refreshed.deliveries.find((d) => d.status === 'SENT')?.ticketId).toBe('ticket-A');
    const deviceB = await ctx.prisma.pushDevice.findUniqueOrThrow({ where: { token: TOKEN_B } });
    expect(deviceB.disabledAt).not.toBeNull();
    expect(ctx.expo.sent.filter((m) => m.to === TOKEN_A)).toHaveLength(1);

    // Receipts confirm delivery.
    await ctx.prisma.notificationDelivery.updateMany({
      where: { notificationId: n.id },
      data: { sentAt: new Date(Date.now() - 20 * 60_000) },
    });
    ctx.expo.receipts['ticket-A'] = { status: 'ok' };
    await push.checkReceipts();
    const final = await ctx.prisma.notification.findUniqueOrThrow({ where: { id: n.id } });
    expect(final.pushStatus).toBe('DELIVERED');
    ctx.expo.nextTickets = null;
  });

  it('skips push when the user disabled push, but keeps the in-app notification', async () => {
    const user = await login(ctx);
    await ctx
      .http()
      .post('/v1/push-devices')
      .set(user.auth)
      .send({ token: 'ExponentPushToken[cccccccccccccccccccccc]', platform: 'android' })
      .expect(200);
    await ctx.http().put('/v1/me/settings').set(user.auth).send({ pushEnabled: false }).expect(200);
    const v = await createVehicle(ctx, user, { currentMileage: 50000 });
    await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(200),
        lastServiceMileage: 42000,
        intervalDays: 180,
      })
      .expect(201);
    await engine.run(new Date(), { ignoreSendWindow: true });
    const n = (await notificationsOf(user))[0];
    if (!n) throw new Error('expected a notification');
    await push.sendForNotification(n.id);
    expect(
      (await ctx.prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).pushStatus,
    ).toBe('SKIPPED');
  });

  it('marks notifications read individually and in bulk', async () => {
    const user = await login(ctx);
    const v = await createVehicle(ctx, user, { currentMileage: 50000 });
    const brake = await serviceTypeId(ctx, 'BRAKE_FLUID');
    await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(200),
        lastServiceMileage: 42000,
        intervalDays: 180,
      })
      .expect(201);
    await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: brake,
        lastServiceDate: daysAgo(800),
        lastServiceMileage: 42000,
        intervalDays: 730,
      })
      .expect(201);
    await engine.run(new Date(), { ignoreSendWindow: true });
    const list = await ctx.http().get('/v1/notifications').set(user.auth).expect(200);
    expect(list.body.unread).toBe(2);
    await ctx
      .http()
      .post(`/v1/notifications/${list.body.items[0].id}/read`)
      .set(user.auth)
      .expect(200);
    expect((await ctx.http().get('/v1/notifications').set(user.auth)).body.unread).toBe(1);
    await ctx.http().post('/v1/notifications/read-all').set(user.auth).expect(200);
    expect(
      (await ctx.http().get('/v1/notifications?unreadOnly=true').set(user.auth)).body.total,
    ).toBe(0);
  });
});
