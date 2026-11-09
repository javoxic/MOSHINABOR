# Release notes — controlled pilot (staging)

|                   |                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Branch            | `release/staging-pilot` (from `audit/production-readiness`)                                                                       |
| Date              | 2026-11-09                                                                                                                        |
| Audience          | Invited pilot testers only (invite-only allowlist)                                                                                |
| Backend / admin   | Docker images `moshina-bor/api:<git-sha>` and `moshina-bor/admin:<git-sha>`                                                       |
| Mobile            | "MOSHINA BOR Pilot", `uz.moshinabor.app.pilot`, version 1.0.0, EAS profile `pilot` / `pilot-testflight`                           |
| Deployment status | **Not deployed to a public server.** Verified in a sandbox staging stack only; see [STAGING_DEPLOYMENT.md](STAGING_DEPLOYMENT.md) |

## What pilot users get

Everything below is implemented and covered by automated tests. It has **not yet** been tested on real devices; see [PILOT_TEST_PLAN.md](PILOT_TEST_PLAN.md).

- **Sign-in by SMS code** (Eskiz) with Uzbek phone-number normalization, a 60 s resend cooldown, a 5-minute code lifetime and 5 attempts.
- **Garage:** up to 20 vehicles with photos (HEIC from iPhone converted on the device), mileage tracking with a correction flow, and fuel types including methane and propane.
- **Maintenance schedules:** by kilometres and/or months, with recommended intervals per service type, statuses (OK / Due soon / Due / Overdue / Unknown) computed in the Asia/Tashkent calendar, and service completion with history.
- **Expenses** in UZS, by category and month, with receipt photos. A service completion can also add an expense; double submission is prevented.
- **Reminders:** a daily reminder run at 10:00 Tashkent time (configurable), push via Expo (FCM/APNs) with real delivery receipts, and an in-app notification list. Push failures are recorded as failures.
- **Offline:** cached data is shown with a clear banner and its timestamp. Saving is blocked while offline, so nothing is silently lost.
- **Account deletion** with a 30-day grace period and cancellation; files are purged afterwards.
- **Languages:** Uzbek (default), Russian and English. Dark theme.

## New in this release (since the audit)

### Pilot safety controls

- **Invite-only access.** `access.registrationMode = allowlist` together with **Settings → Pilot access** in the admin panel. Uninvited numbers get `403 PILOT_ACCESS_ONLY` **before** an SMS is sent, and the check is repeated at code verification. Invites and removals are audited, with phone numbers masked unless the admin has `users.view_pii`.
- **Emergency maintenance mode.** `app.maintenanceMode` plus an optional message:
  - the mobile API answers `503 MAINTENANCE_MODE`;
  - the admin panel, health checks, app-config and SMS webhooks keep working;
  - switching it on requires confirmation, and changes are audited;
  - it takes effect in at most about 10 s.
- **Environment awareness.** `DEPLOYMENT_ENVIRONMENT` (production | staging) is shown in health and app-config. The admin panel displays a permanent STAGING banner and a red bar while maintenance is on.
- **Pilot app variant.** It has its own name, bundle ID and URL scheme, so it can be installed alongside the production app and can never talk to the production API.

### Staging and operations

- **Caddy HTTPS edge** (compose profile `edge`):
  - the API host serves only `/v1/*`; the admin API and `/docs` return 404 there;
  - the admin host is restricted to operator IP ranges;
  - HSTS and security headers.
- **Staging env template** and a tracked production template.
- **`check-config.sh`** refuses unsafe configurations and detects secrets shared between staging and production.
- **`deploy.sh`** runs, in order: config check, encrypted pre-deployment backup, build, start, readiness gate and version history.
- **`rollback.sh`** goes back to a previous version, optionally restoring the database from the pre-deployment backup.
- **`restore.sh`** is environment-aware.
- **`monitor.sh`** checks containers, readiness, error bursts and backup age, and sends alerts to a webhook.
- `APP_VERSION` is now mandatory, so a stack can no longer silently start `:latest`.

### Fixes

- **Release blocker (mobile):** a production `expo export` run after a pilot export inlined the **staging** API URL from Metro's transform cache. The app now reads the URL from the build manifest, and the export scripts clear the cache. Regression test `config.test.ts`.
- **Repo:** `.gitignore` had silently excluded `.env.production.example` since the first build. Both env templates are now tracked.
- All fixes from the production-readiness audit are included unchanged. See [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md): H1–H3, M1–M5, L1–L6.

### Database migration

`20261109135740_pilot_access_allowlist` adds the table `access_allowlist`. The migration is **additive only**: the previous release keeps working on the new schema, so a code-only rollback is safe.

## Release-engineering changes for the first public staging deployment

- **Staging starts invite-only:** with `DEPLOYMENT_ENVIRONMENT=staging`, `access.registrationMode` defaults to `allowlist` until an administrator changes it.
- **`check-config.sh` refuses more unsafe configurations:**
  - non-public hostnames;
  - the sandbox or staging certificate authorities;
  - non-80/443 edge ports;
  - an API URL or CORS origin that does not match the domains;
  - missing ACME e-mail or alert webhook;
  - admin IP entries that are open, too broad, documentation examples or inside Docker's range;
  - database or Redis passwords that would break connection URLs (templates now recommend `openssl rand -hex 32`).

  It has a 31-case regression test in CI with shellcheck. `SANDBOX_DRILL=1` (shell only) exists for local rehearsals.

- **Secret in access logs fixed:** the admin nginx access log recorded the SMS delivery-callback secret from the query string. It now logs paths without query strings.
- **Caddy no longer trusts forwarded headers from private networks.** The edge is the first hop, so clients cannot spoof the IP used for OTP rate limiting.
- **Container logs are rotated** (20 MB × 5 per service).
- **`monitor.sh`** also checks the edge container, the public HTTPS endpoint with full certificate verification, and certificate expiry (< 14 days).
- **New `verify-public.sh`** for post-deployment verification from outside the server.
- **All scripts accept absolute env-file paths.**
- **EAS:** build numbers are managed remotely (`appVersionSource: remote`, `autoIncrement`); the unusable `development` profile was removed; the configuration is validated with `@expo/eas-json`.
- **New documents:** [EXTERNAL_DEPENDENCIES.md](EXTERNAL_DEPENDENCIES.md), [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md), [GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md).

## Known limitations and open items

- **Not verified with real services:**
  - real SMS delivery (Eskiz);
  - real push delivery (FCM/APNs);
  - EAS builds;
  - behaviour on physical devices;
  - real ACME certificates on a public host.

  All of these need external accounts; see [STAGING_DEPLOYMENT.md](STAGING_DEPLOYMENT.md#required-external-credentials).

- **Error tracking:** structured logs plus `monitor.sh` alerts only. No hosted error tracker such as Sentry is integrated.
- **OTA updates:** EAS Update is not configured. Fixes to the mobile app require a new build.
- **`pnpm audit --prod`:** 2 high and 1 low advisories, in `image-size` and `deepmerge`, pulled in by Expo/Metro tooling. They are build-time only and not shipped in the API or admin runtime. See [REMAINING_RISKS.md](REMAINING_RISKS.md).
- **Account deletion:** after a deletion is cancelled, push reminders resume once the app is opened again. That launch re-registers the device.
- **Security testing:** no independent penetration test has been done. Recommended before a public launch.

## Verification of this release

Final run on 2026-11-09, on `release/staging-pilot`:

| Check                                                                                                           | Result                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`, Prettier, typecheck and ESLint (all workspaces)                               | pass                                                                                                                                                |
| `packages/shared` / `packages/validation`                                                                       | 59 / 8 passed                                                                                                                                       |
| Backend Jest (real PostgreSQL 16 + Redis 7), 15 suites                                                          | 127 passed                                                                                                                                          |
| Mobile Jest                                                                                                     | 31 passed                                                                                                                                           |
| Admin Vitest / Playwright E2E (real API)                                                                        | 8 / 10 passed                                                                                                                                       |
| **Total automated tests**                                                                                       | **243 passed, 0 failed**                                                                                                                            |
| Backend `nest build`, admin `tsc -b && vite build`                                                              | pass                                                                                                                                                |
| `prisma migrate diff` (migrations vs. schema)                                                                   | no drift                                                                                                                                            |
| `expo export --clear` production / pilot (Android + iOS)                                                        | pass. Public config: `uz.moshinabor.app` → `https://api.moshinabor.uz`; `uz.moshinabor.app.pilot` → `https://staging.moshinabor.uz`                 |
| `pnpm audit --prod`                                                                                             | 0 critical, 2 high, 1 low (build-time only; see REMAINING_RISKS R1/R2)                                                                              |
| Sandbox staging stack redeployed with `deploy.sh` (encrypted pre-deployment backup; edge started automatically) | ready over HTTPS; admin API and `/docs` return 404; unauthenticated API returns 401; uninvited OTP returns 403 `PILOT_ACCESS_ONLY`; `monitor.sh` OK |
| Emergency maintenance via SQL ([ROLLBACK_PLAN.md §1](ROLLBACK_PLAN.md))                                         | 503 `MAINTENANCE_MODE` within 11 s; back to normal after it was switched off                                                                        |
| EAS builds, real devices, real SMS and push                                                                     | **not run** (external accounts required)                                                                                                            |
