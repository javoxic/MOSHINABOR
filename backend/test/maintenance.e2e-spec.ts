import {
  createTestApp,
  createVehicle,
  daysAgo,
  login,
  serviceTypeId,
  type LoggedInUser,
  type TestContext,
} from './helpers';
import { addDays } from '@moshina/shared';

describe('Maintenance schedules and service history', () => {
  let ctx: TestContext;
  let user: LoggedInUser;
  let oil: string;
  beforeAll(async () => {
    ctx = await createTestApp();
    user = await login(ctx);
    oil = await serviceTypeId(ctx, 'ENGINE_OIL');
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('computes next due date and mileage, whichever comes first', async () => {
    const v = await createVehicle(ctx, user, { currentMileage: 50000 });
    const last = daysAgo(100);
    const r = await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: last,
        lastServiceMileage: 43000,
        intervalDays: 180,
        intervalKm: 8000,
        estimatedCost: '350000',
      })
      .expect(201);
    expect(r.body.nextDueDate).toBe(addDays(last, 180));
    expect(r.body.nextDueMileage).toBe(51000);
    expect(r.body.estimatedCost).toBe('350000.00');
    // 1000 km left (≤ due-soon threshold) while 80 days left → mileage triggers first.
    expect(r.body.computed).toMatchObject({
      status: 'DUE_SOON',
      kmRemaining: 1000,
      triggeredBy: 'MILEAGE',
      mileageStale: false,
    });
  });

  it('validates schedules', async () => {
    const v = await createVehicle(ctx, user, { currentMileage: 1000 });
    const noInterval = await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(1),
        lastServiceMileage: 900,
      })
      .expect(400);
    expect(noInterval.body.code).toBe('VALIDATION_FAILED');
    await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: addDays(daysAgo(0), 3),
        lastServiceMileage: 900,
        intervalDays: 10,
      })
      .expect(400);
    await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(1),
        lastServiceMileage: 5000,
        intervalDays: 10,
      })
      .expect(400);
    await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(1),
        lastServiceMileage: 900,
        intervalDays: 10,
      })
      .expect(201);
    const dup = await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(1),
        lastServiceMileage: 900,
        intervalDays: 10,
      })
      .expect(409);
    expect(dup.body.code).toBe('CONFLICT');
  });

  it('completing maintenance creates record + expense, updates mileage and advances the schedule atomically', async () => {
    const v = await createVehicle(ctx, user, { currentMileage: 60000 });
    const s = await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(200),
        lastServiceMileage: 52000,
        intervalDays: 180,
        intervalKm: 8000,
      })
      .expect(201);
    expect(s.body.computed.status).toBe('OVERDUE');

    const today = daysAgo(0);
    const done = await ctx
      .http()
      .post(`/v1/schedules/${s.body.id}/complete`)
      .set(user.auth)
      .send({
        date: today,
        mileage: 60500,
        cost: 420000,
        serviceProvider: 'Oil Express',
        partsUsed: 'Shell 5W-30 4L, filter',
      })
      .expect(200);
    expect(done.body.schedule).toMatchObject({
      lastServiceDate: today,
      lastServiceMileage: 60500,
      nextDueDate: addDays(today, 180),
      nextDueMileage: 68500,
    });
    expect(done.body.schedule.computed.status).toBe('OK');
    expect(done.body.record).toMatchObject({
      date: today,
      mileage: 60500,
      cost: '420000.00',
      scheduleId: s.body.id,
      serviceProvider: 'Oil Express',
    });

    const vehicle = await ctx.http().get(`/v1/vehicles/${v.id}`).set(user.auth).expect(200);
    expect(vehicle.body.currentMileage).toBe(60500);
    const expenses = await ctx
      .http()
      .get(`/v1/expenses?vehicleId=${v.id}`)
      .set(user.auth)
      .expect(200);
    expect(expenses.body.items).toHaveLength(1);
    expect(expenses.body.items[0]).toMatchObject({
      category: 'MAINTENANCE',
      amount: '420000.00',
      serviceRecordId: done.body.record.id,
    });
    const logs = await ctx
      .http()
      .get(`/v1/vehicles/${v.id}/mileage-logs`)
      .set(user.auth)
      .expect(200);
    expect(logs.body[0]).toMatchObject({ mileage: 60500, source: 'SERVICE' });
  });

  it('rejects completion that goes back in time', async () => {
    const v = await createVehicle(ctx, user, { currentMileage: 10000 });
    const s = await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(10),
        lastServiceMileage: 9000,
        intervalDays: 100,
      })
      .expect(201);
    await ctx
      .http()
      .post(`/v1/schedules/${s.body.id}/complete`)
      .set(user.auth)
      .send({ date: daysAgo(20), mileage: 9500 })
      .expect(400);
    await ctx
      .http()
      .post(`/v1/schedules/${s.body.id}/complete`)
      .set(user.auth)
      .send({ date: daysAgo(0), mileage: 8000 })
      .expect(400);
    expect(await ctx.prisma.maintenanceRecord.count({ where: { vehicleId: v.id } })).toBe(0);
  });

  it('keeps the schedule consistent when history records are added, edited and deleted', async () => {
    const v = await createVehicle(ctx, user, { currentMileage: 30000 });
    const s = await ctx
      .http()
      .post('/v1/schedules')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(300),
        lastServiceMileage: 20000,
        intervalKm: 8000,
      })
      .expect(201);

    const older = await ctx
      .http()
      .post('/v1/records')
      .set(user.auth)
      .send({ vehicleId: v.id, serviceTypeId: oil, date: daysAgo(100), mileage: 25000 })
      .expect(201);
    let sched = await ctx.http().get(`/v1/schedules/${s.body.id}`).set(user.auth).expect(200);
    expect(sched.body).toMatchObject({ lastServiceMileage: 25000, nextDueMileage: 33000 });

    const newer = await ctx
      .http()
      .post('/v1/records')
      .set(user.auth)
      .send({ vehicleId: v.id, serviceTypeId: oil, date: daysAgo(5), mileage: 29500, cost: 100000 })
      .expect(201);
    sched = await ctx.http().get(`/v1/schedules/${s.body.id}`).set(user.auth).expect(200);
    expect(sched.body).toMatchObject({
      lastServiceDate: daysAgo(5),
      lastServiceMileage: 29500,
      nextDueMileage: 37500,
    });

    // Edit the baseline record's mileage → schedule follows.
    await ctx
      .http()
      .patch(`/v1/records/${newer.body.id}`)
      .set(user.auth)
      .send({ mileage: 29800 })
      .expect(200);
    sched = await ctx.http().get(`/v1/schedules/${s.body.id}`).set(user.auth).expect(200);
    expect(sched.body.lastServiceMileage).toBe(29800);

    // Removing the cost removes the linked expense; re-adding recreates it.
    await ctx
      .http()
      .patch(`/v1/records/${newer.body.id}`)
      .set(user.auth)
      .send({ cost: null })
      .expect(200);
    expect(await ctx.prisma.expense.count({ where: { serviceRecordId: newer.body.id } })).toBe(0);
    await ctx
      .http()
      .patch(`/v1/records/${newer.body.id}`)
      .set(user.auth)
      .send({ cost: 120000 })
      .expect(200);
    expect(
      (
        await ctx.prisma.expense.findUniqueOrThrow({ where: { serviceRecordId: newer.body.id } })
      ).amount.toFixed(0),
    ).toBe('120000');

    // Deleting the baseline record falls back to the latest remaining record.
    await ctx.http().delete(`/v1/records/${newer.body.id}`).set(user.auth).expect(204);
    sched = await ctx.http().get(`/v1/schedules/${s.body.id}`).set(user.auth).expect(200);
    expect(sched.body).toMatchObject({ lastServiceDate: daysAgo(100), lastServiceMileage: 25000 });
    expect(await ctx.prisma.expense.count({ where: { serviceRecordId: newer.body.id } })).toBe(0);
    expect(older.body.scheduleId).toBe(s.body.id);
  });

  it('filters and searches service history', async () => {
    const v = await createVehicle(ctx, user, { currentMileage: 80000 });
    const brakes = await serviceTypeId(ctx, 'BRAKE_PADS');
    await ctx
      .http()
      .post('/v1/records')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        date: daysAgo(40),
        mileage: 70000,
        serviceProvider: 'Avto Servis Chilonzor',
      })
      .expect(201);
    await ctx
      .http()
      .post('/v1/records')
      .set(user.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: brakes,
        date: daysAgo(20),
        mileage: 75000,
        partsUsed: 'Brembo pads',
      })
      .expect(201);
    await ctx
      .http()
      .post('/v1/records')
      .set(user.auth)
      .send({ vehicleId: v.id, serviceTypeId: oil, date: daysAgo(2), mileage: 79000 })
      .expect(201);

    const all = await ctx.http().get(`/v1/records?vehicleId=${v.id}`).set(user.auth).expect(200);
    expect(all.body.total).toBe(3);
    expect(all.body.items[0].mileage).toBe(79000);
    const byType = await ctx
      .http()
      .get(`/v1/records?vehicleId=${v.id}&serviceTypeId=${brakes}`)
      .set(user.auth)
      .expect(200);
    expect(byType.body.total).toBe(1);
    const byDate = await ctx
      .http()
      .get(`/v1/records?vehicleId=${v.id}&from=${daysAgo(30)}&to=${daysAgo(10)}`)
      .set(user.auth)
      .expect(200);
    expect(byDate.body.items.map((r: { mileage: number }) => r.mileage)).toEqual([75000]);
    const search = await ctx
      .http()
      .get(`/v1/records?vehicleId=${v.id}&q=chilonzor`)
      .set(user.auth)
      .expect(200);
    expect(search.body.total).toBe(1);
    const paged = await ctx
      .http()
      .get(`/v1/records?vehicleId=${v.id}&page=2&pageSize=2`)
      .set(user.auth)
      .expect(200);
    expect(paged.body.items).toHaveLength(1);
  });

  it('enforces odometer rules', async () => {
    const v = await createVehicle(ctx, user, { currentMileage: 5000 });
    const dec = await ctx
      .http()
      .post(`/v1/vehicles/${v.id}/mileage`)
      .set(user.auth)
      .send({ mileage: 4000 })
      .expect(422);
    expect(dec.body.code).toBe('MILEAGE_DECREASE');
    const up = await ctx
      .http()
      .post(`/v1/vehicles/${v.id}/mileage`)
      .set(user.auth)
      .send({ mileage: 5200 })
      .expect(200);
    expect(up.body.currentMileage).toBe(5200);
    await ctx
      .http()
      .patch(`/v1/vehicles/${v.id}`)
      .set(user.auth)
      .send({ currentMileage: 5100 })
      .expect(422);
    const fixed = await ctx
      .http()
      .patch(`/v1/vehicles/${v.id}`)
      .set(user.auth)
      .send({ currentMileage: 5100, correctMileage: true })
      .expect(200);
    expect(fixed.body.currentMileage).toBe(5100);
  });

  it('supports multiple vehicles with a primary vehicle', async () => {
    const fresh = await login(ctx);
    const a = await createVehicle(ctx, fresh, { registrationNumber: '01 A 111 AA' });
    const b = await createVehicle(ctx, fresh, { registrationNumber: '01 B 222 BB' });
    let list = await ctx.http().get('/v1/vehicles').set(fresh.auth).expect(200);
    expect(list.body[0]).toMatchObject({ id: a.id, isPrimary: true });
    await ctx.http().post(`/v1/vehicles/${b.id}/primary`).set(fresh.auth).expect(200);
    list = await ctx.http().get('/v1/vehicles').set(fresh.auth).expect(200);
    expect(list.body[0]).toMatchObject({ id: b.id, isPrimary: true });
    await ctx.http().delete(`/v1/vehicles/${b.id}`).set(fresh.auth).expect(204);
    const me = await ctx.http().get('/v1/me').set(fresh.auth).expect(200);
    expect(me.body.settings.primaryVehicleId).toBe(a.id);
  });

  it('dashboard summarizes the selected vehicle', async () => {
    const fresh = await login(ctx);
    const v = await createVehicle(ctx, fresh, { currentMileage: 50000 });
    await ctx
      .http()
      .post('/v1/schedules')
      .set(fresh.auth)
      .send({
        vehicleId: v.id,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(200),
        lastServiceMileage: 41000,
        intervalDays: 180,
      })
      .expect(201);
    await ctx
      .http()
      .post('/v1/expenses')
      .set(fresh.auth)
      .send({ vehicleId: v.id, category: 'FUEL', amount: 200000, date: daysAgo(0) })
      .expect(201);
    const d = await ctx.http().get('/v1/dashboard').set(fresh.auth).expect(200);
    expect(d.body.vehicle.id).toBe(v.id);
    expect(d.body.overdue).toHaveLength(1);
    expect(d.body.nextMaintenance.computed.status).toBe('OVERDUE');
    expect(d.body.expenseSummary.monthTotal).toBe('200000.00');
  });
});
