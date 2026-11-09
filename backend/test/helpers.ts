import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import request from 'supertest';
import { randomInt, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { loadEnv } from '../src/config/env';
import { SMS_PRIMARY_PROVIDER } from '../src/sms/sms.service';
import {
  SmsProviderError,
  type SmsProvider,
  type SmsSendRequest,
  type SmsSendResult,
} from '../src/sms/sms-provider.interface';
import { EXPO_CLIENT } from '../src/notifications/notifications.constants';
import type { ExpoClient } from '../src/notifications/push.service';
import { PrismaService } from '../src/prisma/prisma.service';

/** Test double standing in for the real SMS gateway: records messages instead of sending them. */
export class CapturingSmsProvider implements SmsProvider {
  readonly name = 'eskiz';
  sent: SmsSendRequest[] = [];
  failNext = false;
  configured = true;
  isConfigured(): boolean {
    return this.configured;
  }
  async send(req: SmsSendRequest): Promise<SmsSendResult> {
    if (this.failNext) {
      this.failNext = false;
      throw new SmsProviderError('Simulated provider outage', true, 'HTTP_503');
    }
    this.sent.push(req);
    return { providerMessageId: `msg-${randomUUID()}`, accepted: true };
  }
  lastCodeFor(phone: string): string {
    const msg = [...this.sent].reverse().find((m) => m.to === phone);
    const code = msg?.text.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`No SMS captured for ${phone}`);
    return code;
  }
}

/** Test double for the Expo push API. */
export class FakeExpo implements ExpoClient {
  sent: ExpoPushMessage[] = [];
  nextTickets: ((m: ExpoPushMessage) => ExpoPushTicket) | null = null;
  receipts: Record<
    string,
    { status: 'ok' | 'error'; message?: string; details?: { error?: string } }
  > = {};
  chunkPushNotifications(messages: ExpoPushMessage[]): ExpoPushMessage[][] {
    return messages.length ? [messages] : [];
  }
  async sendPushNotificationsAsync(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    this.sent.push(...messages);
    return messages.map((m) =>
      this.nextTickets ? this.nextTickets(m) : { status: 'ok', id: `ticket-${randomUUID()}` },
    );
  }
  chunkPushNotificationReceiptIds(ids: string[]): string[][] {
    return ids.length ? [ids] : [];
  }
  async getPushNotificationReceiptsAsync(ids: string[]) {
    return Object.fromEntries(
      ids
        .filter((id) => this.receipts[id])
        .map((id) => [id, this.receipts[id] as { status: 'ok' | 'error' }]),
    );
  }
}

export interface TestContext {
  app: NestExpressApplication;
  sms: CapturingSmsProvider;
  expo: FakeExpo;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestContext> {
  const env = loadEnv();
  const sms = new CapturingSmsProvider();
  const expo = new FakeExpo();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(env, { withJobs: false, withHttp: true })],
  })
    .overrideProvider(SMS_PRIMARY_PROVIDER)
    .useValue(sms)
    .overrideProvider(EXPO_CLIENT)
    .useValue(expo)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  configureApp(app, env);
  await app.init();
  return {
    app,
    sms,
    expo,
    prisma: app.get(PrismaService),
    http: () => request(app.getHttpServer()),
  };
}

export function randomIp(): string {
  return `10.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

export function randomPhone(): string {
  const prefixes = ['90', '91', '93', '94', '95', '97', '98', '99', '88', '33'];
  return `+998${prefixes[randomInt(0, prefixes.length)]}${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
}

export interface LoggedInUser {
  id: string;
  phone: string;
  accessToken: string;
  refreshToken: string;
  auth: { Authorization: string };
}

export async function login(ctx: TestContext, phone = randomPhone()): Promise<LoggedInUser> {
  const ip = randomIp();
  await ctx
    .http()
    .post('/v1/auth/otp/request')
    .set('X-Forwarded-For', ip)
    .send({ phone })
    .expect(200);
  const res = await ctx
    .http()
    .post('/v1/auth/otp/verify')
    .set('X-Forwarded-For', ip)
    .send({ phone, code: ctx.sms.lastCodeFor(phone) })
    .expect(200);
  const body = res.body as {
    tokens: { accessToken: string; refreshToken: string };
    user: { id: string };
  };
  return {
    id: body.user.id,
    phone,
    accessToken: body.tokens.accessToken,
    refreshToken: body.tokens.refreshToken,
    auth: { Authorization: `Bearer ${body.tokens.accessToken}` },
  };
}

export const VEHICLE = {
  brand: 'Chevrolet',
  model: 'Cobalt',
  year: 2021,
  registrationNumber: '01 A 123 BC',
  fuelType: 'PETROL',
  engineSize: 1.5,
  currentMileage: 45000,
};

export async function createVehicle(
  ctx: TestContext,
  user: LoggedInUser,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; currentMileage: number }> {
  const res = await ctx
    .http()
    .post('/v1/vehicles')
    .set(user.auth)
    .send({ ...VEHICLE, ...overrides })
    .expect(201);
  return res.body as { id: string; currentMileage: number };
}

export async function serviceTypeId(ctx: TestContext, code: string): Promise<string> {
  const t = await ctx.prisma.serviceType.findFirstOrThrow({ where: { code, ownerUserId: null } });
  return t.id;
}

export function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000 + 5 * 3600_000).toISOString().slice(0, 10);
}
