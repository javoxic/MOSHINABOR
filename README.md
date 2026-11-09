# MOSHINA BOR

Automotive maintenance management platform for vehicle owners in Uzbekistan: vehicles, maintenance
schedules with date/mileage reminders, service history, expenses (UZS) and push notifications —
with a web administration dashboard.

| Part                       | Stack                                                                           | Path                                                       |
| -------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Mobile app (iOS / Android) | Expo SDK 54, React Native 0.81, Expo Router, TanStack Query, Zustand, RHF + Zod | [`mobile/`](mobile)                                        |
| Web admin                  | React 19, Vite 7, React Router 7, TanStack Query, Recharts, CSS Modules         | [`admin/`](admin)                                          |
| API + worker               | NestJS 11, Prisma 6, PostgreSQL 16, Redis 7, BullMQ, Swagger                    | [`backend/`](backend)                                      |
| Shared code                | constants, phone normalization, maintenance engine, Zod schemas, API types      | [`packages/`](packages)                                    |
| Infrastructure             | Dockerfiles, nginx, Docker Compose, backups, CI                                 | [`infrastructure/`](infrastructure), [`.github/`](.github) |

Languages: Uzbek (Latin, default), Russian, English · Currency: UZS · Time zone: Asia/Tashkent · Dark theme only.

## Status

All code paths are implemented and tested (see [docs/TESTING.md](docs/TESTING.md)). **Two external
items must be configured by the operator before go-live** — the code integrates with them for real
but cannot be verified without credentials:

1. **SMS provider credentials** (Eskiz.uz for +998 numbers; optional Twilio for international numbers)
   and an Eskiz-approved OTP message template. Until configured, sign-in returns
   `503 SMS_NOT_CONFIGURED` and the admin _System health_ page shows the SMS provider as not configured.
2. **Expo / EAS project + FCM/APNs credentials** for push notifications and store builds.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#external-services-and-credentials).

## Quick start (local development)

Prerequisites: Node.js 22, pnpm 10 (`corepack enable`), PostgreSQL 16, Redis 7.

```bash
pnpm install
pnpm build:packages

# Backend
cp .env.example backend/.env            # fill the three secrets (openssl rand -base64 48)
cd backend
npx prisma migrate deploy
npm run seed:dev                        # reference data: roles, permissions, categories, templates
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='Your-Strong-Passw0rd' npm run admin:create:dev
npm run start:dev                       # http://localhost:3000, Swagger at /docs

# Admin (new terminal)
cd admin && npm run dev                 # http://localhost:5173 (proxies /v1 to the API)

# Mobile (new terminal)
cd mobile && cp .env.example .env       # set EXPO_PUBLIC_API_URL reachable from the device/emulator
npx expo start
```

With `SMS_PROVIDER=log` (development only — refused in production) the OTP is written to the API
log instead of being sent.

## Documentation

- [Requirements & traceability](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database](docs/DATABASE.md)
- [API](docs/API.md) · [OpenAPI JSON](docs/openapi.json)
- [Security](docs/SECURITY.md)
- [Deployment, mobile builds & production checklist](docs/DEPLOYMENT.md)
- [Testing report](docs/TESTING.md)

## Common commands

```bash
pnpm typecheck                      # all workspaces
pnpm lint
pnpm --filter @moshina/backend test # needs PostgreSQL (db name *_test) + Redis
pnpm --filter @moshina/mobile test
pnpm --filter @moshina/admin test
pnpm --filter @moshina/admin test:e2e   # Playwright against the real backend (db name *_e2e)
```
