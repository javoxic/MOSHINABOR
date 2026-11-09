# Security review

This review is part of the production-readiness audit of 2026-11-09. For each control, the table gives its status and the evidence behind it. Abbreviations:

- **VERIFIED:** checked by an automated test or command, named in the Evidence column.
- **FIXED AND VERIFIED:** a defect was found and fixed during this audit, and the fix was checked the same way.
- **BLOCKED BY EXTERNAL CREDENTIALS:** cannot be checked without accounts that are not configured here.
- **REQUIRES MANUAL TESTING:** needs real devices or a person.

Issue IDs (H1, M4, L2, …) refer to [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md).

## Authentication: SMS OTP

| Control                                                                                                | Status                                     | Evidence                                                                               |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| Uzbek and E.164 normalization; mobile numbers only; landlines rejected                                 | VERIFIED                                   | `phone.test.ts`                                                                        |
| 6-digit code from `crypto.randomInt`, stored as HMAC-SHA256 with a pepper, never in responses or logs  | VERIFIED                                   | `auth.e2e-spec.ts` (hash length; code absent from the response); pino redaction config |
| Expiry 300 s, 5 attempts counted atomically, single use, previous codes invalidated on resend          | VERIFIED                                   | `auth.e2e-spec.ts`                                                                     |
| 60 s resend cooldown; limits per phone (5 per hour, 10 per day) and per IP (60 per hour, configurable) | VERIFIED (per-IP default changed under M4) | `auth.e2e-spec.ts`                                                                     |
| Parallel verification of one code → exactly one session                                                | VERIFIED                                   | `concurrency.e2e-spec.ts`                                                              |
| Parallel requests for one phone → exactly one SMS                                                      | VERIFIED                                   | `concurrency.e2e-spec.ts`                                                              |
| Provider failure → 502; not configured → 503; timeout → retryable error. Never reported as success.    | VERIFIED                                   | `auth.e2e-spec.ts`, `providers.spec.ts`                                                |
| No account enumeration                                                                                 | VERIFIED                                   | Identical responses for new and existing numbers                                       |
| Real Eskiz/Twilio delivery                                                                             | **BLOCKED BY EXTERNAL CREDENTIALS**        | The adapter's HTTP contract is tested against simulated responses only                 |

## Sessions and tokens

| Control                                                                                                       | Status                  | Evidence                                                                |
| ------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| HS256 pinned; issuer, audience and token type checked; `alg:none`, expired and cross-audience tokens rejected | VERIFIED                | `security.e2e-spec.ts`                                                  |
| Refresh rotation; reuse revokes the whole session family; parallel refresh → one session                      | VERIFIED                | `auth.e2e-spec.ts`, `concurrency.e2e-spec.ts`                           |
| Logout, restriction and deletion revoke access immediately                                                    | VERIFIED                | `auth.e2e-spec.ts`, `admin.e2e-spec.ts`, `account-deletion.e2e-spec.ts` |
| Mobile tokens in SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`); single-flight refresh                        | VERIFIED (unit)         | `client.test.ts`                                                        |
| Local data purged on any sign-out (query cache, image caches)                                                 | FIXED AND VERIFIED (M5) | `session.test.ts`                                                       |

## Admin authentication and RBAC

| Control                                                                                                                     | Status                  | Evidence                                                   |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------- |
| Argon2id; lockout after 5 failures; generic error messages                                                                  | VERIFIED                | `admin.e2e-spec.ts`                                        |
| httpOnly, SameSite=Strict, Secure refresh cookie; CSRF header; access token kept in memory only                             | VERIFIED                | `admin.e2e-spec.ts`, Playwright `auth.spec.ts`             |
| **Every** admin route requires a permission. An admin with only `dashboard.view` gets 403 on all 30+ others.                | VERIFIED                | `security.e2e-spec.ts` (routes enumerated from the router) |
| No privilege escalation: an admin cannot grant permissions they lack, change their own role, or remove the last Super Admin | VERIFIED                | `admin.e2e-spec.ts`                                        |
| Phone numbers masked without `users.view_pii`; PII views and searches audited                                               | FIXED AND VERIFIED (L3) | `admin.e2e-spec.ts`, Playwright `permissions.spec.ts`      |

## Authorization and data isolation

| Control                                                                                                             | Status   | Evidence                       |
| ------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------ |
| Every non-public route returns 401 without a token                                                                  | VERIFIED | `security.e2e-spec.ts`         |
| Another user's resources return 404 (19 endpoint/method combinations, plus list filters, creation and custom types) | VERIFIED | `ownership.e2e-spec.ts`        |
| Files are served only to their owner                                                                                | VERIFIED | `ownership.e2e-spec.ts`        |
| Account deletion purges all data and files after the grace period                                                   | VERIFIED | `account-deletion.e2e-spec.ts` |

## Input, output and transport

| Control                                                                                                                               | Status                             | Evidence                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| DTO whitelist with unknown fields forbidden; field-level validation errors                                                            | VERIFIED                           | `ownership.e2e-spec.ts`                                                                                   |
| SQL injection: Prisma parameterization; raw SQL only through tagged templates                                                         | VERIFIED (code review)             | `grep '\$queryRawUnsafe\|\$executeRawUnsafe'`: test harness only, with table names taken from `pg_tables` |
| XSS: the React SPA escapes by default (no `dangerouslySetInnerHTML`); CSP `default-src 'self'`; API responses are JSON with `nosniff` | VERIFIED (code review and headers) | `grep dangerouslySetInnerHTML` finds none                                                                 |
| CSRF: bearer tokens on all state-changing calls; cookie endpoints need a custom header and SameSite=Strict                            | VERIFIED                           | `admin.e2e-spec.ts`                                                                                       |
| Uploads: 8 MB limit, magic-byte detection, re-encoding to JPEG with EXIF/GPS stripped, HEIC refused explicitly                        | FIXED AND VERIFIED (H2)            | `ownership.e2e-spec.ts`                                                                                   |
| CORS allow-list; wildcard refused in production                                                                                       | VERIFIED                           | `security.e2e-spec.ts`, `env.spec.ts`                                                                     |
| Helmet headers on the API; nginx headers on every admin location                                                                      | FIXED AND VERIFIED (L6)            | `security.e2e-spec.ts`; `curl -I` in the production stack                                                 |
| Error bodies contain no stack traces or ORM details                                                                                   | VERIFIED                           | `security.e2e-spec.ts`                                                                                    |
| Rate limiting per user (authenticated) and per IP (anonymous)                                                                         | FIXED AND VERIFIED (M4)            | `user-throttler.guard.spec.ts`                                                                            |

## Configuration, secrets and logging

| Control                                                                                                                        | Status                      | Evidence                                            |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | --------------------------------------------------- |
| Startup refuses missing, short, duplicate or test/placeholder secrets; the development SMS logger; wildcard CORS in production | FIXED AND VERIFIED (L2)     | `env.spec.ts`                                       |
| Swagger off by default in production                                                                                           | FIXED AND VERIFIED (L1)     | `env.spec.ts`; production stack returns 404         |
| No secrets in git history; no snapshots or uploads tracked                                                                     | FIXED AND VERIFIED (M1, M2) | History scan in PRODUCTION_AUDIT.md                 |
| Logs redact authorization headers, cookies, codes, passwords, tokens and the webhook secret                                    | VERIFIED (config review)    | `app.module.ts` redact paths and request serializer |
| Backups encrypted (AES-256), mode 0600, fail-closed                                                                            | FIXED AND VERIFIED (H3)     | Production-stack test                               |
| Containers run as non-root; DB and Redis are not published to the host; admin bound to 127.0.0.1 by default                    | VERIFIED                    | `docker-compose.yml`, Dockerfile `USER app`         |

## Not verifiable here

- Real SMS delivery: Eskiz and Twilio.
- Real push delivery: FCM and APNs.
- TLS configuration of the operator's edge proxy.
- Behavior on physical devices (Keychain/Keystore, permissions, HEIC conversion).
- Penetration test by an independent third party: recommended before public launch.
