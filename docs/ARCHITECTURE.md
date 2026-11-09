# Architecture

```
 ┌──────────────┐     HTTPS      ┌──────────────────────── single host / cluster ─────────────────────────┐
 │ Mobile app   │──────────────▶ │ TLS proxy ─▶ admin (nginx) ──/v1──▶ api (NestJS)  ──▶ PostgreSQL 16     │
 │ Expo / RN    │                │                 │ static SPA            │    │        (data, audit)      │
 └──────────────┘                │                 ▼                       │    └──▶ Redis 7 (rate limits,  │
 ┌──────────────┐                │            Web admin (React)            │          queues, locks, OTP   │
 │ Admin browser│──────────────▶ │                                         ▼          request locks)       │
 └──────────────┘                │                                  worker (NestJS)                       │
                                 │                     cron jobs + BullMQ push queue                      │
                                 └──────────────┬──────────────────────────────┬──────────────────────────┘
                                                ▼                              ▼
                                       Eskiz.uz / Twilio (SMS)        Expo Push → FCM / APNs
```

## Monorepo

pnpm workspaces (`node-linker=hoisted` for Expo/Metro compatibility).

- `packages/shared` — domain constants (categories, permissions, roles, error codes), phone
  normalization, **maintenance engine** (`computeNextDue`, `computeScheduleStatus`, cycle keys),
  Tashkent date helpers, money formatting. Used by the backend, mobile and admin.
- `packages/validation` — Zod 4 schemas for every client form (mobile + admin).
- `packages/api-types` — response contracts shared by the clients.

Clients consume package TypeScript sources (Metro `react-native` field, Vite aliases); the backend
consumes the compiled CommonJS build.

## Backend (NestJS 11)

Controllers are thin; all business logic lives in services.

| Module | Responsibility |
|---|---|
| `config` | Zod-validated environment; production refuses unsafe settings |
| `auth` | OTP request/verify, token issuing/rotation, logout |
| `sms` | Provider adapters (Eskiz, Twilio, dev logger) behind `SmsProvider`; delivery webhooks |
| `users` | Profile, settings, avatar, account deletion (grace period + purge job) |
| `files` | Image validation (magic bytes), re-encoding with sharp (EXIF/GPS stripped), private storage |
| `vehicles` | Vehicles, images, odometer readings (`applyMileage`) |
| `service-types` | System + custom categories |
| `maintenance` | Schedules, completion transaction, service history, baseline resync |
| `expenses` | Expenses and statistics (SQL aggregation in the Tashkent calendar) |
| `dashboard` | Mobile home screen aggregate |
| `notifications` | In-app notifications, templates, Expo push + receipts, reminder engine, announcements |
| `jobs` | Cron schedule (worker role) with Redis locks |
| `admin` | Admin auth, RBAC guard, audit log, management endpoints |
| `health` | Liveness/readiness, full system health, public app config |

**Process roles** (`PROCESS_ROLE`): `api` serves HTTP; `worker` runs cron jobs and the BullMQ push
queue; `all` does both (development). Every cron job takes a Redis lock, so multiple workers are safe.

**Request pipeline:** helmet → CORS allow-list → body limit → throttler (Redis store) → `JwtAuthGuard`
(global, fail-closed; admin controllers opt out and use `AdminGuard`) → validation pipe
(whitelist + forbid unknown fields) → idempotency interceptor (optional `Idempotency-Key`) →
service → centralized exception filter (`{statusCode, code, message, details, requestId}`).

## Maintenance engine

`nextDueDate = lastServiceDate + intervalDays`, `nextDueMileage = lastServiceMileage + intervalKm`.
Status is the **worse** of the date and mileage classifications:

| Status | Date | Mileage |
|---|---|---|
| `DUE_SOON` | ≤ `dueSoonDays` (14) left | ≤ `dueSoonKm` (1000) left |
| `DUE` | due date reached | due mileage reached |
| `OVERDUE` | ≥ `overdueGraceDays` (7) past | ≥ `overdueGraceKm` (500) past |

Thresholds are admin-configurable system settings. Odometer data older than `mileageStaleDays` (30)
is flagged `mileageStale`; the UI warns, and the reminder engine ignores the mileage dimension for
that vehicle and sends a `MILEAGE_UPDATE_REQUIRED` prompt instead.

Completing maintenance or adding a newer history record moves the schedule baseline; editing or
deleting the baseline record recomputes it from the latest remaining record (`schedule-sync.ts`).

## Reminders and deduplication

Hourly (`:05`, within the configured local send window, ending 21:00 Tashkent) the engine scans active
schedules of active users with reminders enabled. Each reminder has a dedupe key such as
`sched:{id}:{cycleHash}:MAINTENANCE_DUE`; overdue keys add a repeat bucket
(`floor(epochDay / overdueRepeatDays)`). A unique index on `(user_id, dedupe_key)` makes re-runs and
concurrent workers idempotent. Push delivery is a BullMQ job per notification (`jobId = push-{id}`,
4 attempts, exponential backoff); tickets are stored per device and receipts are checked every 10 min.

## Mobile app

Expo Router file-based navigation: `(auth)` stack → `(tabs)` (Home, Vehicles, Service, Expenses,
Profile) + detail stacks. Server state via TanStack Query, persisted to AsyncStorage (7 days, success
only) so the last known data is available offline; an offline banner states when that data was
fetched, and mutations are disabled offline. Creation forms send an `Idempotency-Key`. Access/refresh
tokens live in SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`); a single-flight refresh prevents
parallel rotations (which the server would treat as token theft).

## Web admin

SPA served by nginx in the same origin as `/v1` (required for the `SameSite=Strict` refresh cookie).
Access token in memory only; refresh via httpOnly cookie + `X-Requested-With` CSRF header. Navigation
and routes are filtered by permissions client-side, and every endpoint re-checks permissions
server-side (the client filtering is UX only).

## Key decisions

- **Prisma 6 / NestJS 11** (current maintained majors with long track records) rather than release candidates.
- **Local file storage on a volume** (single-node deployment); `StorageService` isolates the driver.
- **Eskiz.uz** as primary SMS provider for Uzbekistan; **Twilio** optional for foreign numbers.
  International numbers are rejected unless an international provider is configured.
- **Hard delete after a 30-day grace period** for account deletion (cascading FKs) instead of anonymization.
- **Money as `NUMERIC(14,2)`** and calendar dates as `DATE` (Tashkent calendar); instants as `TIMESTAMPTZ`.
