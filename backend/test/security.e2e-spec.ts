import jwt from 'jsonwebtoken';
import { createTestApp, login, type TestContext } from './helpers';

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

/** Lists every registered Express route (Express 5 router). */
function routes(ctx: TestContext): { method: string; path: string }[] {
  const app = ctx.app.getHttpAdapter().getInstance() as { router?: { stack: Layer[] }; _router?: { stack: Layer[] } };
  const stack = app.router?.stack ?? app._router?.stack ?? [];
  const out: { method: string; path: string }[] = [];
  const walk = (layers: Layer[]) => {
    for (const l of layers) {
      if (l.route) for (const m of Object.keys(l.route.methods)) out.push({ method: m, path: l.route.path });
      else if (l.handle?.stack) walk(l.handle.stack);
    }
  };
  walk(stack);
  return out;
}

const PUBLIC = new Set([
  'post /v1/auth/otp/request',
  'post /v1/auth/otp/verify',
  'post /v1/auth/refresh',
  'post /v1/admin/auth/login',
  'post /v1/admin/auth/refresh',
  'post /v1/admin/auth/logout',
  'get /v1/health/live',
  'get /v1/health/ready',
  'get /v1/app-config',
  'post /v1/webhooks/sms/eskiz',
  'post /v1/webhooks/sms/twilio',
]);

describe('Security: route protection and token handling', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('every non-public route rejects anonymous requests', async () => {
    const all = routes(ctx);
    expect(all.length).toBeGreaterThan(60);
    const unprotected: string[] = [];
    for (const r of all) {
      const key = `${r.method} ${r.path}`;
      if (PUBLIC.has(key) || !r.path.startsWith('/v1/')) continue;
      const path = r.path.replace(/:(\w+)/g, (_m, name: string) => (name === 'code' || name === 'key' ? 'X' : '00000000-0000-4000-8000-000000000000'));
      try {
        const res = await (ctx.http() as unknown as Record<string, (p: string) => Promise<{ status: number }>>)[r.method]!(path);
        if (res.status !== 401) unprotected.push(`${key} → ${res.status}`);
      } catch (err) {
        unprotected.push(`${key} → ${(err as Error).message}`);
      }
    }
    expect(unprotected).toEqual([]);
  });

  it('admin routes reject user tokens and user routes reject admin-signed tokens', async () => {
    const user = await login(ctx);
    for (const p of ['/v1/admin/users', '/v1/admin/dashboard/stats', '/v1/admin/settings/health', '/v1/admin/audit-logs']) {
      await ctx.http().get(p).set(user.auth).expect(401);
    }
    const forged = jwt.sign({ sub: user.id, fam: 'x', typ: 'user' }, process.env.JWT_ADMIN_SECRET as string, { issuer: 'moshina-bor', audience: 'moshina-bor-mobile' });
    await ctx.http().get('/v1/me').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('rejects unsigned ("alg: none") and expired tokens', async () => {
    const user = await login(ctx);
    const payload = jwt.decode(user.accessToken) as Record<string, unknown>;
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`;
    await ctx.http().get('/v1/me').set('Authorization', `Bearer ${none}`).expect(401);
    const { iat: _iat, exp: _exp, ...claims } = payload;
    const expired = jwt.sign({ ...claims, exp: Math.floor(Date.now() / 1000) - 10 }, process.env.JWT_ACCESS_SECRET as string);
    await ctx.http().get('/v1/me').set('Authorization', `Bearer ${expired}`).expect(401);
  });

  it('sets secure HTTP headers and never exposes the framework', async () => {
    const res = await ctx.http().get('/v1/health/live').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('applies CORS only to configured origins', async () => {
    const ok = await ctx.http().options('/v1/me').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'GET');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const bad = await ctx.http().options('/v1/me').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'GET');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('SMS webhooks require the shared secret', async () => {
    await ctx.http().post('/v1/webhooks/sms/eskiz').send({ message_id: 'x', status: 'DELIVRD' }).expect(403);
    await ctx.http().post('/v1/webhooks/sms/eskiz?secret=wrong').send({ message_id: 'x', status: 'DELIVRD' }).expect(403);
    await ctx.http().post(`/v1/webhooks/sms/eskiz?secret=${process.env.SMS_CALLBACK_SECRET}`).send({ message_id: 'x', status: 'DELIVRD' }).expect(200);
  });

  it('error responses never leak stack traces or internals', async () => {
    const res = await ctx.http().get('/v1/vehicles/not-a-uuid').set((await login(ctx)).auth).expect(400);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|prisma|at \w+ \(/i);
    expect(res.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
  });
});
