# Testing report

Last full run: 2026-11-09 on `release/staging-pilot` (controlled pilot preparation) (Node 22, PostgreSQL 16, Redis 7,
Chromium via Playwright 1.63). Audit details: [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md). Manual pilot cases: [PILOT_TEST_PLAN.md](PILOT_TEST_PLAN.md).

| Suite                        | Tool                                        | Scope                                                                                                                                                                                                                                                      | Result                   |
| ---------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `packages/shared`            | Jest                                        | phone normalization, dates, maintenance engine incl. boundary/leap-year/timezone edge cases, money                                                                                                                                                         | **59/59 passed**         |
| `packages/validation`        | Jest                                        | Zod form schemas (vehicle, schedule, expense, phone, admin password, numeric text input)                                                                                                                                                                   | **8/8 passed**           |
| `backend` unit + integration | Jest + Supertest, real PostgreSQL + Redis   | adapters (incl. timeouts), env validation, throttling keys, auth/OTP, sessions, ownership, maintenance, expenses, reminders & cadence, push, exhaustive admin RBAC, security, concurrency, account deletion, pilot maintenance mode and invite-only access | **127/127 passed**       |
| `mobile`                     | Jest + React Native Testing Library         | auth flow, entry routing, vehicle creation, schedule form, service records, dashboard states, i18n, token refresh, JPEG conversion, sign-out data purge, Tashkent dates, release API URL from the build manifest                                           | **31/31 passed**         |
| `admin` unit                 | Vitest + Testing Library                    | login validation, redirects, permission-filtered navigation, forbidden pages, filters, tables, staging banner                                                                                                                                              | **8/8 passed**           |
| `admin` E2E                  | Playwright, real backend + production build | login/cookie session/logout, dashboard numbers, RBAC, admin management, user search/filter/restrict, vehicles, settings & health                                                                                                                           | **10/10 passed**         |
| **Total**                    |                                             |                                                                                                                                                                                                                                                            | **243 passed, 0 failed** |

Builds verified: backend `nest build`; admin `tsc -b && vite build`; mobile `expo export` for Android
and iOS (Hermes bundles); Docker images for API and admin; full production Compose stack started
(migrations, seed, admin CLI, health, worker, backup + restore round-trip). Typecheck and lint pass in
every workspace.

## Highlights of what is covered

- **SMS OTP:** code never in responses/storage, wrong-attempt counting and lockout, expiry, reuse,
  resend cooldown + invalidation of the old code, per-phone and per-IP limits, provider failure → 502,
  unconfigured provider → 503, unsupported international numbers.
- **Sessions:** refresh rotation, reuse detection revoking the family, logout immediacy, forged/`alg:none`/
  expired/cross-audience tokens, restricted accounts.
- **Authorization:** every non-public route (enumerated from the router) returns 401 anonymously;
  19 cross-user endpoint/method combinations return 404; admin vs. user token separation; privilege
  escalation attempts rejected.
- **Maintenance:** whichever-first calculation, completion transaction (record + expense + odometer +
  schedule), baseline resync on record edit/delete, validation of dates and mileage.
- **Reminders:** send window, deduplication across repeated runs, new cycle after completion,
  mileage ignored when stale + mileage prompt, preferences, push tickets/receipts, dead-token disabling.
- **Expenses:** decimal precision, statistics by category/month/vehicle, linked-expense protection.
- **Uploads:** re-encoding to JPEG, dimension cap, rejection of disguised non-images and oversize files.

## Running the tests

```bash
pnpm install && pnpm build:packages
# Backend: requires a database whose name ends in _test (the harness refuses others) and Redis
createdb moshina_bor_test
cd backend && npx prisma generate && npx jest --runInBand
# Mobile / admin unit
cd mobile && npx jest
cd admin && npx vitest run
# Admin E2E: requires backend build and a database whose name ends in _e2e
createdb moshina_bor_e2e
cd backend && npx nest build && cd ../admin && pnpm test:e2e
```

Test databases are prepared with `prisma migrate deploy` and truncated by the harness (it refuses to
touch databases not named `*_test` / `*_e2e`).

## Not covered by automated tests (requires external credentials or devices)

- Real SMS delivery through Eskiz/Twilio (adapter HTTP contracts are tested with mocked responses).
- Real push delivery to FCM/APNs and native store builds (bundles are verified with `expo export`).
- On-device UI testing on physical iOS/Android hardware.
