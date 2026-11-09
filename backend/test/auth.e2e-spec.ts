import { createTestApp, login, randomIp, randomPhone, type TestContext } from './helpers';

describe('Authentication (SMS OTP)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('sends a real SMS through the provider and never returns the code', async () => {
    const phone = randomPhone();
    const res = await ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', randomIp()).send({ phone: phone.replace('+998', '') }).expect(200);
    expect(res.body).toEqual({ requestId: expect.any(String), phone, expiresInSeconds: 300, resendAfterSeconds: 60 });
    expect(JSON.stringify(res.body)).not.toContain(ctx.sms.lastCodeFor(phone));
    const row = await ctx.prisma.smsVerification.findFirstOrThrow({ where: { phone }, orderBy: { createdAt: 'desc' } });
    expect(row.codeHash).not.toContain(ctx.sms.lastCodeFor(phone));
    expect(row.codeHash).toHaveLength(64);
    expect(row.smsStatus).toBe('SENT');
  });

  it('rejects invalid phone numbers', async () => {
    const res = await ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', randomIp()).send({ phone: '12345' }).expect(400);
    expect(res.body.code).toBe('PHONE_INVALID');
  });

  it('creates the user on first verification and authenticates on later ones', async () => {
    const phone = randomPhone();
    const first = await login(ctx, phone);
    const me = await ctx.http().get('/v1/me').set(first.auth).expect(200);
    expect(me.body.phone).toBe(phone);
    expect(me.body.settings.language).toBe('uz');

    // Wait out cooldown by moving the previous verification back in time.
    await ctx.prisma.smsVerification.updateMany({ where: { phone }, data: { createdAt: new Date(Date.now() - 120_000) } });
    const second = await login(ctx, phone);
    expect(second.id).toBe(first.id);
    expect(await ctx.prisma.user.count({ where: { phone } })).toBe(1);
  });

  it('counts wrong attempts, then locks the code', async () => {
    const phone = randomPhone();
    const ip = randomIp();
    await ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', ip).send({ phone }).expect(200);
    const code = ctx.sms.lastCodeFor(phone);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 4; i >= 1; i--) {
      const r = await ctx.http().post('/v1/auth/otp/verify').set('X-Forwarded-For', ip).send({ phone, code: wrong }).expect(400);
      expect(r.body).toMatchObject({ code: 'OTP_INVALID', details: { attemptsRemaining: i } });
    }
    const fifth = await ctx.http().post('/v1/auth/otp/verify').set('X-Forwarded-For', ip).send({ phone, code: wrong }).expect(429);
    expect(fifth.body.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    // Even the correct code no longer works.
    const after = await ctx.http().post('/v1/auth/otp/verify').set('X-Forwarded-For', ip).send({ phone, code }).expect(400);
    expect(after.body.code).toBe('OTP_INVALID');
  });

  it('rejects expired codes', async () => {
    const phone = randomPhone();
    const ip = randomIp();
    await ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', ip).send({ phone }).expect(200);
    await ctx.prisma.smsVerification.updateMany({ where: { phone }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await ctx.http().post('/v1/auth/otp/verify').set('X-Forwarded-For', ip).send({ phone, code: ctx.sms.lastCodeFor(phone) }).expect(400);
    expect(r.body.code).toBe('OTP_EXPIRED');
  });

  it('rejects reused codes', async () => {
    const phone = randomPhone();
    const ip = randomIp();
    await ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', ip).send({ phone }).expect(200);
    const code = ctx.sms.lastCodeFor(phone);
    await ctx.http().post('/v1/auth/otp/verify').set('X-Forwarded-For', ip).send({ phone, code }).expect(200);
    const r = await ctx.http().post('/v1/auth/otp/verify').set('X-Forwarded-For', ip).send({ phone, code }).expect(400);
    expect(r.body.code).toBe('OTP_INVALID');
  });

  it('enforces resend cooldown and invalidates the previous code on resend', async () => {
    const phone = randomPhone();
    const ip = randomIp();
    await ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', ip).send({ phone }).expect(200);
    const firstCode = ctx.sms.lastCodeFor(phone);
    const cool = await ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', ip).send({ phone }).expect(429);
    expect(cool.body.code).toBe('OTP_RESEND_COOLDOWN');
    expect(cool.body.details.retryAfterSeconds).toBeGreaterThan(0);

    await ctx.prisma.smsVerification.updateMany({ where: { phone }, data: { createdAt: new Date(Date.now() - 61_000) } });
    await ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', ip).send({ phone }).expect(200);
    const secondCode = ctx.sms.lastCodeFor(phone);
    if (firstCode !== secondCode) {
      await ctx.http().post('/v1/auth/otp/verify').set('X-Forwarded-For', ip).send({ phone, code: firstCode }).expect(400);
    }
    await ctx.http().post('/v1/auth/otp/verify').set('X-Forwarded-For', ip).send({ phone, code: secondCode }).expect(200);
  });

  it('enforces the per-phone hourly limit', async () => {
    const phone = randomPhone();
    // Simulate 5 earlier requests within the last hour (beyond the cooldown).
    await ctx.prisma.smsVerification.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        phone,
        codeHash: 'x'.repeat(64),
        expiresAt: new Date(),
        provider: 'eskiz',
        smsStatus: 'SENT' as const,
        createdAt: new Date(Date.now() - (10 + i) * 60_000),
        invalidatedAt: new Date(),
      })),
    });
    const r = await ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', randomIp()).send({ phone }).expect(429);
    expect(r.body.code).toBe('OTP_LIMIT_EXCEEDED');
  });

  it('enforces the per-IP hourly limit', async () => {
    const ip = randomIp();
    await ctx.prisma.smsVerification.createMany({
      data: Array.from({ length: 20 }, () => ({
        phone: randomPhone(),
        codeHash: 'x'.repeat(64),
        requestIp: ip,
        expiresAt: new Date(),
        provider: 'eskiz',
        createdAt: new Date(Date.now() - 5 * 60_000),
      })),
    });
    const r = await ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', ip).send({ phone: randomPhone() }).expect(429);
    expect(r.body.code).toBe('OTP_LIMIT_EXCEEDED');
  });

  it('reports provider failures without pretending success', async () => {
    const phone = randomPhone();
    ctx.sms.failNext = true;
    const r = await ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', randomIp()).send({ phone }).expect(502);
    expect(r.body.code).toBe('SMS_SEND_FAILED');
    const row = await ctx.prisma.smsVerification.findFirstOrThrow({ where: { phone } });
    expect(row.smsStatus).toBe('FAILED');
    expect(row.invalidatedAt).not.toBeNull();
    // A failed send does not impose a cooldown.
    await ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', randomIp()).send({ phone }).expect(200);
  });

  it('returns 503 when the SMS provider is not configured', async () => {
    ctx.sms.configured = false;
    try {
      const r = await ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', randomIp()).send({ phone: randomPhone() }).expect(503);
      expect(r.body.code).toBe('SMS_NOT_CONFIGURED');
    } finally {
      ctx.sms.configured = true;
    }
  });

  it('rejects international numbers when no international provider is configured', async () => {
    const r = await ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', randomIp()).send({ phone: '+14155552671' }).expect(400);
    expect(r.body.code).toBe('PHONE_INVALID');
  });

  describe('sessions', () => {
    it('rotates refresh tokens and detects reuse', async () => {
      const user = await login(ctx);
      const r1 = await ctx.http().post('/v1/auth/refresh').send({ refreshToken: user.refreshToken }).expect(200);
      expect(r1.body.refreshToken).not.toBe(user.refreshToken);
      await ctx.http().get('/v1/me').set({ Authorization: `Bearer ${r1.body.accessToken}` }).expect(200);

      // Reusing the old refresh token revokes the whole session family.
      const reuse = await ctx.http().post('/v1/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
      expect(reuse.body.code).toBe('REFRESH_TOKEN_REUSED');
      await ctx.http().post('/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
      await ctx.http().get('/v1/me').set({ Authorization: `Bearer ${r1.body.accessToken}` }).expect(401);
    });

    it('logout revokes the session immediately', async () => {
      const user = await login(ctx);
      await ctx.http().post('/v1/auth/logout').set(user.auth).send({ refreshToken: user.refreshToken }).expect(204);
      await ctx.http().get('/v1/me').set(user.auth).expect(401);
      await ctx.http().post('/v1/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
    });

    it('rejects missing, malformed and forged tokens', async () => {
      await ctx.http().get('/v1/me').expect(401);
      await ctx.http().get('/v1/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
      const forged =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZmFtIjoiMSIsInR5cCI6InVzZXIifQ.Zm9yZ2VkLXNpZ25hdHVyZQ';
      await ctx.http().get('/v1/me').set('Authorization', `Bearer ${forged}`).expect(401);
      await ctx.http().post('/v1/auth/refresh').send({ refreshToken: 'x'.repeat(64) }).expect(401);
    });

    it('blocks restricted accounts from signing in', async () => {
      const user = await login(ctx);
      await ctx.prisma.user.update({ where: { id: user.id }, data: { status: 'RESTRICTED' } });
      await ctx.http().get('/v1/me').set(user.auth).expect(403);
      await ctx.prisma.smsVerification.updateMany({ where: { phone: user.phone }, data: { createdAt: new Date(Date.now() - 120_000) } });
      const ip = randomIp();
      await ctx.http().post('/v1/auth/otp/request').set('X-Forwarded-For', ip).send({ phone: user.phone }).expect(200);
      const r = await ctx.http().post('/v1/auth/otp/verify').set('X-Forwarded-For', ip).send({ phone: user.phone, code: ctx.sms.lastCodeFor(user.phone) }).expect(403);
      expect(r.body.code).toBe('ACCOUNT_RESTRICTED');
    });
  });
});
