# Security

> The independent audit of 2026-11-09 is in [SECURITY_REVIEW.md](SECURITY_REVIEW.md),
> [PRODUCTION_AUDIT.md](PRODUCTION_AUDIT.md) and [REMAINING_RISKS.md](REMAINING_RISKS.md).

## Controls implemented

### Authentication

- [x] SMS OTP: 6 digits from `crypto.randomInt`, stored as `HMAC-SHA256(OTP_PEPPER, phone:code)`, 5-minute
      expiry, max 5 attempts counted atomically (`UPDATE … WHERE attempts < max`), single use, previous codes
      invalidated on resend, constant-time comparison.
- [x] Abuse protection: 60 s resend cooldown, 5/hour and 10/day per phone, 60/hour per IP (carrier-NAT aware), Redis lock per
      phone against races, endpoint throttling (Redis-backed, shared by all API instances).
- [x] No enumeration: identical OTP request responses for new and existing numbers.
- [x] OTP never returned by the API nor logged (pino redaction of `*.code`, SMS text never logged; the
      development `log` provider is refused when `NODE_ENV=production`).
- [x] Tokens: HS256 JWT access tokens (15 min, issuer/audience/type checked, algorithm pinned),
      opaque refresh tokens (SHA-256 hashed at rest), rotation on every use, reuse detection revokes the
      whole session family, logout/restriction revoke immediately (guard checks the session family on each request).
- [x] Admins: argon2id (19 MiB, t=2), timing-equalized unknown-email path, lockout 15 min after 5
      failures, rehash on parameter change, password policy (≥ 12 chars, mixed case, digit),
      httpOnly `SameSite=Strict` `Secure` refresh cookie scoped to `/v1/admin/auth`, CSRF header on cookie
      endpoints, access token in memory only, absolute 12 h session lifetime.

### Authorization

- [x] Global fail-closed guard: every route needs a user token unless explicitly public; admin controllers
      use `AdminGuard` which reloads admin, role and permissions from the DB on every request.
- [x] Route-enumeration test ensures every non-public route returns 401 anonymously.
- [x] Ownership checks on every user resource; foreign resources return 404.
- [x] RBAC with least privilege; admins cannot grant permissions they lack, modify their own role,
      disable themselves, edit the Super Admin role, or remove the last active Super Admin.
- [x] PII minimization: phone numbers masked unless `users.view_pii`; phone search requires it; PII views audited.
- [x] Audit log for logins (incl. failures), user restrictions, session revocations, admin/role changes,
      settings, templates, announcements, category changes, manual reminder runs.

### Input / output

- [x] DTO validation with whitelist + `forbidNonWhitelisted`; Zod validation on clients.
- [x] Prisma parameterized queries; raw SQL only via tagged templates.
- [x] Uploads: 8 MB limit, magic-byte type detection, decoding/re-encoding with sharp (EXIF/GPS stripped,
      pixel limit), server-generated storage keys (no path traversal), private download with ownership check,
      `nosniff`.
- [x] Centralized error filter: no stack traces or ORM details in responses; request IDs for correlation.
- [x] JSON body limit 256 KB.

### Transport / headers

- [x] helmet (HSTS, nosniff, frameguard, etc.), `x-powered-by` disabled; admin nginx sets a strict CSP
      (`default-src 'self'`, `frame-ancestors 'none'`).
- [x] CORS allow-list (no wildcard in production, credentials only for listed origins).
- [x] `trust proxy` configured explicitly (`TRUST_PROXY`) so rate limits use the real client IP.

### Secrets and configuration

- [x] All secrets from environment; startup fails on missing/short/duplicate secrets; production refuses
      the dev SMS logger, wildcard CORS, and a missing SMS callback secret.
- [x] SMS delivery webhooks authenticated with a constant-time-compared secret; secret redacted from logs.
- [x] `.env` files ignored by git; templates contain no values.
- [x] Containers run as non-root; images contain no build tooling or source maps.

### Privacy

- [x] Account deletion request with 30-day grace period, then hard delete of all user data and files.
- [x] Backups encrypted with GnuPG AES-256 (fail-closed without a passphrase); mobile purges cached data and images on sign-out.
- [x] Push disabled immediately on deletion request; data minimization in admin views.

## Accepted residual risks (dependency audit)

`pnpm audit --prod` after upgrades/overrides reports:

| Package              | Severity | Where                              | Assessment                                                                                                                                                                         |
| -------------------- | -------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image-size` < 2.0.3 | high     | `expo > @expo/metro` (build-time)  | Only parses the project's own image assets during bundling; not shipped to devices or servers. The patched 2.x line is API-incompatible with Metro. Re-evaluate when Expo updates. |
| `deepmerge` 4.x      | low      | `expo > @expo/config` (build-time) | No patched version published; build-time config merge of trusted files.                                                                                                            |

Resolved: sharp (libvips/libheif/librsvg CVEs, upgraded to 0.35.5), zod (memory exhaustion, upgraded to
4.6), multer, postcss, decode-uri-component, glob, minimatch, deepmerge-ts (pnpm overrides).

## Operational checklist

- [ ] Generate unique secrets (`openssl rand -base64 48`) per environment; store in a secret manager.
- [ ] Terminate TLS (HTTPS only) in front of the admin/API; set `TRUST_PROXY` to the number of proxies.
- [ ] Keep `SWAGGER_ENABLED=false` in production unless access is restricted.
- [ ] Restrict network access to PostgreSQL/Redis to the internal network (default in Compose).
- [ ] Ship backups off-host with encryption and test restores quarterly.
- [ ] Rotate Eskiz/Twilio/Expo credentials if staff with access leave; review the audit log regularly.
- [ ] Create named admin accounts per person (no shared accounts); remove access promptly.
- [ ] Run `pnpm audit --prod` in CI and update dependencies monthly.

## Reporting

Report vulnerabilities privately to the platform owner; do not open public issues for security bugs.
