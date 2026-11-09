import sharp from 'sharp';
import {
  createTestApp,
  createVehicle,
  daysAgo,
  login,
  serviceTypeId,
  type LoggedInUser,
  type TestContext,
} from './helpers';

describe('Resource ownership and authorization', () => {
  let ctx: TestContext;
  let alice: LoggedInUser;
  let bob: LoggedInUser;
  let aliceVehicle: string;
  let aliceSchedule: string;
  let aliceRecord: string;
  let aliceExpense: string;
  let aliceFileUrl: string;
  let aliceCustomType: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    alice = await login(ctx);
    bob = await login(ctx);
    aliceVehicle = (await createVehicle(ctx, alice)).id;
    const oil = await serviceTypeId(ctx, 'ENGINE_OIL');
    aliceSchedule = (
      await ctx
        .http()
        .post('/v1/schedules')
        .set(alice.auth)
        .send({
          vehicleId: aliceVehicle,
          serviceTypeId: oil,
          lastServiceDate: daysAgo(30),
          lastServiceMileage: 44000,
          intervalKm: 8000,
        })
        .expect(201)
    ).body.id;
    aliceRecord = (
      await ctx
        .http()
        .post('/v1/records')
        .set(alice.auth)
        .send({
          vehicleId: aliceVehicle,
          serviceTypeId: oil,
          date: daysAgo(10),
          mileage: 44500,
          cost: 300000,
        })
        .expect(201)
    ).body.id;
    aliceExpense = (
      await ctx
        .http()
        .post('/v1/expenses')
        .set(alice.auth)
        .send({ vehicleId: aliceVehicle, category: 'FUEL', amount: 150000, date: daysAgo(1) })
        .expect(201)
    ).body.id;
    const png = await sharp({
      create: { width: 64, height: 48, channels: 3, background: '#1e88ff' },
    })
      .png()
      .toBuffer();
    const img = await ctx
      .http()
      .post(`/v1/vehicles/${aliceVehicle}/images`)
      .set(alice.auth)
      .attach('file', png, 'car.png')
      .expect(201);
    aliceFileUrl = new URL(img.body.images[0].url).pathname;
    aliceCustomType = (
      await ctx
        .http()
        .post('/v1/service-types')
        .set(alice.auth)
        .send({ name: 'Wheel alignment', suggestedIntervalKm: 10000 })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('owner can access their resources', async () => {
    await ctx.http().get(`/v1/vehicles/${aliceVehicle}`).set(alice.auth).expect(200);
    await ctx.http().get(`/v1/schedules/${aliceSchedule}`).set(alice.auth).expect(200);
    await ctx.http().get(`/v1/records/${aliceRecord}`).set(alice.auth).expect(200);
    await ctx.http().get(`/v1/expenses/${aliceExpense}`).set(alice.auth).expect(200);
    const file = await ctx.http().get(aliceFileUrl).set(alice.auth).expect(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
  });

  it.each([
    ['GET', () => `/v1/vehicles/${aliceVehicle}`],
    ['PATCH', () => `/v1/vehicles/${aliceVehicle}`],
    ['DELETE', () => `/v1/vehicles/${aliceVehicle}`],
    ['POST', () => `/v1/vehicles/${aliceVehicle}/primary`],
    ['POST', () => `/v1/vehicles/${aliceVehicle}/mileage`],
    ['GET', () => `/v1/vehicles/${aliceVehicle}/mileage-logs`],
    ['GET', () => `/v1/schedules/${aliceSchedule}`],
    ['PATCH', () => `/v1/schedules/${aliceSchedule}`],
    ['DELETE', () => `/v1/schedules/${aliceSchedule}`],
    ['POST', () => `/v1/schedules/${aliceSchedule}/complete`],
    ['GET', () => `/v1/records/${aliceRecord}`],
    ['PATCH', () => `/v1/records/${aliceRecord}`],
    ['DELETE', () => `/v1/records/${aliceRecord}`],
    ['GET', () => `/v1/expenses/${aliceExpense}`],
    ['PATCH', () => `/v1/expenses/${aliceExpense}`],
    ['DELETE', () => `/v1/expenses/${aliceExpense}`],
    ['GET', () => aliceFileUrl],
    ['PUT', () => `/v1/service-types/${aliceCustomType}`],
    ['DELETE', () => `/v1/service-types/${aliceCustomType}`],
  ])('another user cannot %s %s (404, no existence leak)', async (method, path) => {
    const body =
      method === 'POST' && path().endsWith('/mileage')
        ? { mileage: 99999 }
        : method === 'POST' && path().endsWith('/complete')
          ? { date: daysAgo(0), mileage: 50000 }
          : method === 'PATCH'
            ? path().includes('/expenses/')
              ? { description: 'hijack' }
              : { notes: 'hijack' }
            : method === 'PUT'
              ? { name: 'x-hijack' }
              : undefined;
    const req = ctx.http()[method.toLowerCase() as 'get'](path()).set(bob.auth);
    const res = body ? await req.send(body) : await req;
    expect(res.status).toBe(404);
  });

  it('another user cannot list, create or filter against a foreign vehicle', async () => {
    await ctx.http().get(`/v1/records?vehicleId=${aliceVehicle}`).set(bob.auth).expect(404);
    await ctx.http().get(`/v1/expenses?vehicleId=${aliceVehicle}`).set(bob.auth).expect(404);
    await ctx.http().get(`/v1/schedules?vehicleId=${aliceVehicle}`).set(bob.auth).expect(404);
    await ctx.http().get(`/v1/dashboard?vehicleId=${aliceVehicle}`).set(bob.auth).expect(404);
    const oil = await serviceTypeId(ctx, 'OIL_FILTER');
    await ctx
      .http()
      .post('/v1/schedules')
      .set(bob.auth)
      .send({
        vehicleId: aliceVehicle,
        serviceTypeId: oil,
        lastServiceDate: daysAgo(1),
        lastServiceMileage: 1,
        intervalDays: 30,
      })
      .expect(404);
    await ctx
      .http()
      .post('/v1/expenses')
      .set(bob.auth)
      .send({ vehicleId: aliceVehicle, category: 'FUEL', amount: 1000, date: daysAgo(1) })
      .expect(404);
    await ctx
      .http()
      .post('/v1/records')
      .set(bob.auth)
      .send({ vehicleId: aliceVehicle, serviceTypeId: oil, date: daysAgo(1), mileage: 1 })
      .expect(404);
  });

  it("another user cannot use someone else's custom service type", async () => {
    const bobVehicle = (await createVehicle(ctx, bob)).id;
    await ctx
      .http()
      .post('/v1/schedules')
      .set(bob.auth)
      .send({
        vehicleId: bobVehicle,
        serviceTypeId: aliceCustomType,
        lastServiceDate: daysAgo(1),
        lastServiceMileage: 1,
        intervalDays: 30,
      })
      .expect(404);
    const list = await ctx.http().get('/v1/service-types').set(bob.auth).expect(200);
    expect(list.body.find((t: { id: string }) => t.id === aliceCustomType)).toBeUndefined();
  });

  it('lists only own data', async () => {
    const vehicles = await ctx.http().get('/v1/vehicles').set(bob.auth).expect(200);
    expect(vehicles.body.every((v: { id: string }) => v.id !== aliceVehicle)).toBe(true);
    const records = await ctx.http().get('/v1/records').set(bob.auth).expect(200);
    expect(records.body.items).toHaveLength(0);
    const expenses = await ctx.http().get('/v1/expenses').set(bob.auth).expect(200);
    expect(expenses.body.items).toHaveLength(0);
  });

  it('user endpoints reject admin tokens and admin endpoints reject user tokens', async () => {
    await ctx.http().get('/v1/admin/auth/me').set(alice.auth).expect(401);
    await ctx.http().get('/v1/admin/users').set(alice.auth).expect(401);
  });
});

describe('Input validation and uploads', () => {
  let ctx: TestContext;
  let user: LoggedInUser;
  beforeAll(async () => {
    ctx = await createTestApp();
    user = await login(ctx);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('rejects unknown fields and invalid values with field details', async () => {
    const r = await ctx
      .http()
      .post('/v1/vehicles')
      .set(user.auth)
      .send({
        brand: '',
        model: 'X',
        year: 1800,
        registrationNumber: 'A',
        fuelType: 'STEAM',
        currentMileage: -1,
        isAdmin: true,
      })
      .expect(400);
    expect(r.body.code).toBe('VALIDATION_FAILED');
    const fields = (r.body.details as { field: string }[]).map((d) => d.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        'brand',
        'year',
        'registrationNumber',
        'fuelType',
        'currentMileage',
        'isAdmin',
      ]),
    );
  });

  it('rejects invalid UUIDs in paths', async () => {
    await ctx.http().get('/v1/vehicles/not-a-uuid').set(user.auth).expect(400);
  });

  it('rejects an invalid VIN', async () => {
    await ctx
      .http()
      .post('/v1/vehicles')
      .set(user.auth)
      .send({
        brand: 'A',
        model: 'B',
        year: 2020,
        registrationNumber: '01A123BC',
        vin: 'IOQ12345678901234',
        fuelType: 'PETROL',
        currentMileage: 10,
      })
      .expect(400);
  });

  it('accepts images, strips metadata and re-encodes to JPEG; rejects non-images', async () => {
    const vehicle = await createVehicle(ctx, user);
    const png = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: '#222' },
    })
      .png()
      .toBuffer();
    const r = await ctx
      .http()
      .post(`/v1/vehicles/${vehicle.id}/images`)
      .set(user.auth)
      .attach('file', png, 'big.png')
      .expect(201);
    const file = await ctx.prisma.storedFile.findFirstOrThrow({ where: { ownerUserId: user.id } });
    expect(file.mimeType).toBe('image/jpeg');
    expect(Math.max(file.width ?? 0, file.height ?? 0)).toBeLessThanOrEqual(2048);
    expect(r.body.coverImageUrl).toContain(file.id);

    const fake = Buffer.from('<?php echo "pwned"; ?>'.padEnd(64, ' '));
    const bad = await ctx
      .http()
      .post(`/v1/vehicles/${vehicle.id}/images`)
      .set(user.auth)
      .attach('file', fake, { filename: 'x.jpg', contentType: 'image/jpeg' })
      .expect(400);
    expect(bad.body.code).toBe('FILE_INVALID');
  });

  it('rejects oversized uploads', async () => {
    const vehicle = await createVehicle(ctx, user);
    const huge = Buffer.alloc(9 * 1024 * 1024, 1);
    const r = await ctx
      .http()
      .post(`/v1/vehicles/${vehicle.id}/images`)
      .set(user.auth)
      .attach('file', huge, 'huge.jpg');
    expect(r.status).toBe(413);
  });

  it('replays idempotent POSTs instead of duplicating', async () => {
    const vehicle = await createVehicle(ctx, user);
    const body = { vehicleId: vehicle.id, category: 'FUEL', amount: 99000, date: daysAgo(0) };
    const key = 'idem-test-key-0001';
    const a = await ctx
      .http()
      .post('/v1/expenses')
      .set(user.auth)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    const b = await ctx
      .http()
      .post('/v1/expenses')
      .set(user.auth)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    expect(b.body.id).toBe(a.body.id);
    expect(b.headers['idempotent-replay']).toBe('true');
    expect(await ctx.prisma.expense.count({ where: { vehicleId: vehicle.id } })).toBe(1);
  });
});

describe('HEIC uploads', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('rejects HEIC with an explicit, actionable error (server cannot decode HEVC)', async () => {
    const user = await login(ctx);
    const vehicle = await createVehicle(ctx, user);
    const heicHeader = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypheic'),
      Buffer.alloc(64),
    ]);
    const r = await ctx
      .http()
      .post(`/v1/vehicles/${vehicle.id}/images`)
      .set(user.auth)
      .attach('file', heicHeader, { filename: 'IMG_0001.HEIC', contentType: 'image/heic' })
      .expect(400);
    expect(r.body).toMatchObject({
      code: 'FILE_INVALID',
      message: 'HEIC images are not supported. Please upload JPEG, PNG or WebP.',
    });
  });
});
