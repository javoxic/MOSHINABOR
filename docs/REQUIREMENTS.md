# Requirements and traceability

This maps the product requirements to their implementation and tests. "Awaiting configuration"
marks items that are implemented against the real external API but need operator credentials.

## Authentication (SMS OTP)

| Requirement | Implementation | Tests |
|---|---|---|
| Language selection before sign-in | `mobile/app/(auth)/language.tsx` | `navigation.test.tsx` |
| Uzbek + international validation, E.164 normalization | `packages/shared/src/phone.ts` (libphonenumber-js, mobile numbers only) | `phone.test.ts`, `auth.e2e-spec.ts` |
| Real SMS delivery through a provider adapter | `backend/src/sms/*` — Eskiz.uz (primary, +998), Twilio (optional international) | `providers.spec.ts` (HTTP contract), `auth.e2e-spec.ts` | 
| Code expiry (5 min), attempt limit (5), resend cooldown (60 s) | `backend/src/auth/otp.service.ts` | `auth.e2e-spec.ts` |
| Per-phone (5/h, 10/day) and per-IP (20/h) limits, endpoint throttling | `otp.service.ts`, `@Throttle` on auth routes | `auth.e2e-spec.ts` |
| Codes hashed (HMAC-SHA256 + pepper), never logged or returned | `otp.service.ts`, pino redaction | `auth.e2e-spec.ts` |
| No account enumeration | identical request response for new/existing numbers | `auth.e2e-spec.ts` |
| Access + refresh tokens, rotation, reuse detection, revocation | `backend/src/auth/token.service.ts` | `auth.e2e-spec.ts`, `security.e2e-spec.ts` |
| Secure storage, session restore, logout | `mobile/src/store/*` (SecureStore), `useSignOut` | `auth.test.tsx`, `client.test.ts` |
| Provider failure is reported, never faked | `SmsService` → 502/503 | `auth.e2e-spec.ts` |
| **Provider credentials** | **Awaiting configuration** (Eskiz account, approved template) | — |

## Profile, vehicles, maintenance, history, expenses

| Requirement | Implementation | Tests |
|---|---|---|
| Profile: name, photo, language, notification prefs, created date, deletion request, privacy | `users/*`, mobile `profile`, `settings/*` | `notifications.e2e-spec.ts`, mobile tests |
| Multiple vehicles, primary, images, mileage logs | `vehicles/*`, mobile `vehicles/*` | `maintenance.e2e-spec.ts`, `vehicles-maintenance.test.tsx` |
| Ownership enforced on every request (404 for foreign resources) | `getOwned` checks in every service | `ownership.e2e-spec.ts` (19 endpoint/method combinations) |
| 15 maintenance categories + custom categories; suggested intervals labeled as guidance | `DEFAULT_SERVICE_TYPES`, `service-types/*`, UI notice | `ScheduleForm` test |
| Date OR mileage — whichever comes first | `computeScheduleStatus` | `maintenance.test.ts`, `maintenance.e2e-spec.ts` |
| Stale mileage clearly indicated; no mileage alerts from stale data | `mileageStale`, reminder engine `ignoreStaleMileage` | `notifications.e2e-spec.ts` |
| Complete maintenance in one transaction (record + expense + mileage + schedule) | `SchedulesService.complete` | `maintenance.e2e-spec.ts` |
| Service history with filters, search, attachments; schedule kept in sync on edit/delete | `records.service.ts`, `schedule-sync.ts` | `maintenance.e2e-spec.ts` |
| Expenses CRUD, monthly/annual/vehicle statistics from real data, DECIMAL money | `expenses/*` | `expenses.e2e-spec.ts` |

## Notifications

| Requirement | Implementation | Tests |
|---|---|---|
| Push (Expo) + in-app, read/unread, history | `notifications/*`, mobile `notifications.tsx` | `notifications.e2e-spec.ts` |
| Upcoming / due / overdue reminders, deduplicated | `reminder-engine.service.ts` (unique `(user_id, dedupe_key)`) | `notifications.e2e-spec.ts` |
| Device registration, token refresh, dead-token cleanup, receipts | `PushDevicesController`, `PushService.checkReceipts` | `notifications.e2e-spec.ts` |
| Preferences respected | settings checks in engine and push service | `notifications.e2e-spec.ts` |
| **Expo/FCM/APNs credentials** | **Awaiting configuration** (EAS project) | — |

## Web admin

| Requirement | Implementation | Tests |
|---|---|---|
| Secure login, sessions, lockout | `admin/auth/*` (argon2id, httpOnly cookie, CSRF header) | `admin.e2e-spec.ts`, Playwright `auth.spec.ts` |
| Roles: Super Admin, Administrator, Support, Analyst + custom roles; permission checks | `AdminGuard`, `DEFAULT_ROLE_PERMISSIONS` | `admin.e2e-spec.ts`, Playwright `permissions.spec.ts` |
| Audit logging of privileged actions and PII views | `AuditService` | `admin.e2e-spec.ts` |
| Dashboard with real charts | `AdminDashboardController`, `Dashboard.tsx` | Playwright `dashboard.spec.ts` |
| Users (search, filters, detail, restrict, sessions) | `admin/users/*`, `Users.tsx` | Playwright `users.spec.ts` |
| Vehicles (search, filters, ownership) | `AdminVehiclesController`, `Vehicles.tsx` | Playwright `vehicles.spec.ts` |
| Maintenance categories & default intervals, statistics | `AdminMaintenanceController` | `admin.e2e-spec.ts` |
| Templates, history, delivery status, scheduled jobs, announcements | `AdminNotificationsController` | `admin.e2e-spec.ts` |
| Settings, SMS status, system/database health | `AdminSettingsController`, `HealthService` | Playwright `settings.spec.ts` |
| No passwords/OTPs/tokens exposed; phones masked without `users.view_pii` | DTO mapping, `maskPhone` | `admin.e2e-spec.ts`, Playwright |

## Non-functional

Offline cache with explicit stale banners, idempotent submissions, i18n (uz/ru/en), dark design
system, accessibility labels and 44 pt touch targets, Docker deployment, backups, CI — see
ARCHITECTURE, SECURITY and DEPLOYMENT.
