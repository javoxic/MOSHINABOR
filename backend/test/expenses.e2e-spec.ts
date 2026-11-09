import { createTestApp, createVehicle, daysAgo, login, serviceTypeId, type LoggedInUser, type TestContext } from './helpers';

describe('Expenses', () => {
  let ctx: TestContext;
  let user: LoggedInUser;
  beforeAll(async () => {
    ctx = await createTestApp();
    user = await login(ctx);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('CRUD with decimal precision', async () => {
    const v = await createVehicle(ctx, user);
    const c = await ctx.http().post('/v1/expenses').set(user.auth).send({ vehicleId: v.id, category: 'FUEL', amount: 123456.78, date: daysAgo(1), liters: 40.5, mileage: 45500, description: 'AI-92' }).expect(201);
    expect(c.body).toMatchObject({ amount: '123456.78', liters: '40.50', mileage: 45500, category: 'FUEL' });
    const veh = await ctx.http().get(`/v1/vehicles/${v.id}`).set(user.auth).expect(200);
    expect(veh.body.currentMileage).toBe(45500);
    const u = await ctx.http().patch(`/v1/expenses/${c.body.id}`).set(user.auth).send({ amount: 100000, category: 'OTHER' }).expect(200);
    expect(u.body).toMatchObject({ amount: '100000.00', category: 'OTHER' });
    await ctx.http().delete(`/v1/expenses/${c.body.id}`).set(user.auth).expect(204);
    await ctx.http().get(`/v1/expenses/${c.body.id}`).set(user.auth).expect(404);
  });

  it('rejects invalid amounts and future dates', async () => {
    const v = await createVehicle(ctx, user);
    await ctx.http().post('/v1/expenses').set(user.auth).send({ vehicleId: v.id, category: 'FUEL', amount: 0, date: daysAgo(1) }).expect(400);
    await ctx.http().post('/v1/expenses').set(user.auth).send({ vehicleId: v.id, category: 'FUEL', amount: -5, date: daysAgo(1) }).expect(400);
    await ctx.http().post('/v1/expenses').set(user.auth).send({ vehicleId: v.id, category: 'TOYS', amount: 5, date: daysAgo(1) }).expect(400);
    await ctx.http().post('/v1/expenses').set(user.auth).send({ vehicleId: v.id, category: 'FUEL', amount: 5, date: '2999-01-01' }).expect(400);
  });

  it('protects expenses linked to service records', async () => {
    const v = await createVehicle(ctx, user);
    const oil = await serviceTypeId(ctx, 'ENGINE_OIL');
    const rec = await ctx.http().post('/v1/records').set(user.auth).send({ vehicleId: v.id, serviceTypeId: oil, date: daysAgo(3), mileage: 45000, cost: 250000 }).expect(201);
    const exp = await ctx.prisma.expense.findUniqueOrThrow({ where: { serviceRecordId: rec.body.id } });
    await ctx.http().patch(`/v1/expenses/${exp.id}`).set(user.auth).send({ amount: 1 }).expect(409);
    await ctx.http().delete(`/v1/expenses/${exp.id}`).set(user.auth).expect(409);
  });

  it('computes statistics by category, month and vehicle from real data', async () => {
    const fresh = await login(ctx);
    const a = await createVehicle(ctx, fresh, { registrationNumber: '10 A 100 AA' });
    const b = await createVehicle(ctx, fresh, { registrationNumber: '10 B 200 BB' });
    const year = daysAgo(0).slice(0, 4);
    const entries = [
      { vehicleId: a.id, category: 'FUEL', amount: 100000, date: `${year}-01-15` },
      { vehicleId: a.id, category: 'FUEL', amount: 50000.5, date: `${year}-01-20` },
      { vehicleId: a.id, category: 'REPAIR', amount: 700000, date: `${year}-02-03` },
      { vehicleId: b.id, category: 'PARTS', amount: 300000, date: `${year}-02-10` },
      { vehicleId: b.id, category: 'FUEL', amount: 80000, date: `${Number(year) - 1}-12-31` },
    ];
    for (const e of entries) await ctx.http().post('/v1/expenses').set(fresh.auth).send(e).expect(201);

    const stats = await ctx.http().get(`/v1/expenses/stats?from=${year}-01-01&to=${year}-02-28`).set(fresh.auth).expect(200);
    expect(stats.body.total).toBe('1150000.50');
    expect(stats.body.count).toBe(4);
    expect(stats.body.byCategory).toEqual([
      { category: 'REPAIR', total: '700000.00', count: 1 },
      { category: 'PARTS', total: '300000.00', count: 1 },
      { category: 'FUEL', total: '150000.50', count: 2 },
    ]);
    expect(stats.body.byMonth).toEqual([
      { month: `${year}-01`, total: '150000.50' },
      { month: `${year}-02`, total: '1000000.00' },
    ]);
    expect(stats.body.byVehicle).toEqual(expect.arrayContaining([
      { vehicleId: a.id, total: '850000.50' },
      { vehicleId: b.id, total: '300000.00' },
    ]));

    const vehicleStats = await ctx.http().get(`/v1/expenses/stats?vehicleId=${b.id}&from=${Number(year) - 1}-12-01&to=${year}-02-28`).set(fresh.auth).expect(200);
    expect(vehicleStats.body.total).toBe('380000.00');
    expect(vehicleStats.body.byMonth.map((m: { month: string }) => m.month)).toEqual([`${Number(year) - 1}-12`, `${year}-01`, `${year}-02`]);

    const filtered = await ctx.http().get(`/v1/expenses?category=FUEL&from=${year}-01-01&to=${year}-12-31`).set(fresh.auth).expect(200);
    expect(filtered.body.total).toBe(2);
    expect(filtered.body.totalAmount).toBe('150000.50');
  });
});
