# Staging deployment (controlled pilot)

This document describes how to stand up the **staging** environment that the pilot app talks to.

> **Status (2026-11-09).** The full staging stack, including the HTTPS edge, encrypted backups, deployment, rollback and monitoring, was brought up and exercised **inside the development sandbox** using locally issued certificates. It has **not** been deployed to a public server. It cannot serve real pilot users until the operator:
>
> - provisions a host and DNS;
> - supplies the external credentials listed under [Required external credentials](#required-external-credentials);
> - runs the steps below.
>
> The step-by-step procedure for the first real deployment is [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md); the accounts it needs are listed in [EXTERNAL_DEPENDENCIES.md](EXTERNAL_DEPENDENCIES.md), and the go/no-go gates in [GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md).

Related documents:

- [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md)
- [PILOT_TEST_PLAN.md](PILOT_TEST_PLAN.md)
- [RELEASE_NOTES.md](RELEASE_NOTES.md)
- [DEPLOYMENT.md](DEPLOYMENT.md), for production

## 1. Architecture and isolation

```
 pilot phones ──HTTPS──► staging.moshinabor.uz ─┐
                                                 │   Caddy edge (profile "edge", ports 80/443)
 operator IPs ──HTTPS──► admin-staging.moshinabor.uz ─┤   • automatic TLS (ACME)
                                                 │   • API host: only /v1/* (admin API and /docs → 404)
                                                 │   • admin host: 403 unless client IP ∈ ADMIN_ALLOWED_IPS
                                                 ▼
                       admin (nginx, 127.0.0.1:8081) ──► api (NestJS) ──► postgres 16 / redis 7
                                                          worker (BullMQ reminders, push, purge)
                                                          backup (pg_dump + files, GnuPG AES-256)
```

Staging is isolated from production as follows. The table also shows how each point is enforced.

| What            | Staging                                                                                                                                                            | Enforced by                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Compose project | `moshina-bor-staging` (production: `moshina-bor`)                                                                                                                  | `deploy.sh` derives it from `DEPLOYMENT_ENVIRONMENT`                                                   |
| Database        | own volume, own DB name/user (`moshina_bor_staging` / `moshina_staging`)                                                                                           | volumes are namespaced by project; `check-config.sh .env.staging .env` fails on a shared `POSTGRES_DB` |
| Redis, uploads  | own volumes                                                                                                                                                        | project namespace                                                                                      |
| Secrets         | generated separately                                                                                                                                               | `check-config.sh .env.staging .env` fails if any secret equals production's                            |
| Backups         | `./backups-staging`, own passphrase `secrets/staging_backup_passphrase`                                                                                            | env template                                                                                           |
| Mobile app      | separate app "MOSHINA BOR Pilot", bundle/package `uz.moshinabor.app.pilot`, URL scheme `moshinabor-pilot`, pointed at `https://staging.moshinabor.uz`              | `APP_VARIANT=pilot` in `eas.json`                                                                      |
| User data       | **never** copied from production. Pilot users register themselves with their own phone numbers.                                                                    | Procedure: no production dump may be restored on staging                                               |
| Visibility      | the admin shows a permanent amber "STAGING ENVIRONMENT — test data only" banner; `/v1/health/ready` and `/v1/app-config` report `deploymentEnvironment: "staging"` | `DEPLOYMENT_ENVIRONMENT=staging`                                                                       |

Use a **separate host** for staging if at all possible. If staging shares a host with production, the two compose projects remain isolated, but the edge ports (80/443) can only be bound once. In that case, put both sets of hostnames behind one edge or load balancer (see §8).

## 2. Prerequisites

- Linux host with Docker Engine 24+ and the compose plugin. Recommended: 2 vCPU, 4 GB RAM, 40 GB disk.
- DNS A/AAAA records for `staging.moshinabor.uz` and `admin-staging.moshinabor.uz` pointing at the host.
- Ports 80 and 443 open to the internet; all other ports closed by the firewall.
- Static public IPs, or a VPN egress range, from which operators reach the admin panel.
- The images `moshina-bor/api:<version>` and `moshina-bor/admin:<version>`. `deploy.sh` builds them from the checked-out commit, or you can pull them from your registry.

## 3. Create the environment file

```sh
cd infrastructure/deployment
cp .env.staging.example .env.staging
chmod 600 .env.staging
for v in POSTGRES_PASSWORD REDIS_PASSWORD JWT_ACCESS_SECRET JWT_ADMIN_SECRET OTP_PEPPER SMS_CALLBACK_SECRET; do
  sed -i "s|^$v=.*|$v=$(openssl rand -hex 32)|" .env.staging   # written straight into the file, never printed
done
mkdir -p secrets && openssl rand -base64 48 > secrets/staging_backup_passphrase && chmod 600 secrets/staging_backup_passphrase
```

Fill in `API_DOMAIN`, `ADMIN_DOMAIN`, `ADMIN_ALLOWED_IPS` (space-separated CIDRs, **quoted**), `ACME_EMAIL`, `ESKIZ_*`, `EXPO_ACCESS_TOKEN` and `ALERT_WEBHOOK_URL`.

**Store the backup passphrase outside the server as well**, for example in a password manager. Without it, the backups cannot be decrypted.

`.env.staging`, `secrets/` and `backups-staging/` are git-ignored. Never commit them.

## 4. Check the configuration

```sh
./check-config.sh .env.staging            # this file on its own
./check-config.sh .env.staging .env       # additionally: shares no secret or DB name with production
```

The check exits 1 and the deployment is refused if any of these is true:

- `DEPLOYMENT_ENVIRONMENT` is invalid or `APP_VERSION` is missing;
- a secret is empty, shorter than 32 characters, looks like a placeholder or test value, or is duplicated;
- the API URL or any CORS origin is not https, or CORS contains a wildcard;
- Swagger is enabled;
- `HTTP_BIND` is not on loopback;
- backup encryption is off, or the passphrase file is missing, short, or not chmod 600/400;
- `SMS_PROVIDER=log` is set;
- the admin IP allow-list is empty while a domain is set;
- `ALERT_WEBHOOK_URL` is empty or not https;
- with `API_DOMAIN` set (public edge):
  - a hostname is not public (`localhost`, `.local`, `.test`, `example…`), or the two hostnames are the same;
  - `API_PUBLIC_URL` is not exactly `https://<API_DOMAIN>`, or `CORS_ORIGINS` lacks `https://<ADMIN_DOMAIN>`;
  - `ACME_EMAIL` is missing or an example address;
  - `CADDY_EXTRA_GLOBAL_OPTIONS` selects a non-public CA (`local_certs`, `internal`, Let's Encrypt staging);
  - the edge ports are not 80/443;
  - an `ADMIN_ALLOWED_IPS` entry allows everyone (`0.0.0.0/0`), is broader than /16 (IPv6: /32), is a documentation example address (`203.0.113.x`, `198.51.100.x`, `192.0.2.x`; the template values), or overlaps Docker's `172.16.0.0/12`;
- staging shares a secret or the database name with the production file given as the second argument.

`SANDBOX_DRILL=1`, set in the shell (the env file cannot set it), turns the edge checks that only a real public host can meet into warnings. It exists only for local rehearsals; never use it on a real server. The checker has its own regression test: `sh infrastructure/deployment/tests/check-config.test.sh` (31 cases, also run in CI).

If the Eskiz credentials are empty, the check prints a warning and sign-in answers `503 SMS_NOT_CONFIGURED`. It never pretends to send an SMS.

## 5. Deploy

```sh
./deploy.sh .env.staging "$(git rev-parse --short HEAD)"
```

`deploy.sh` runs these steps in order:

1. **Preflight.** Runs `check-config.sh` and aborts on failure.
2. **Pre-deployment backup.** If the database is already running, takes an encrypted dump of the database and the uploads into `backups-staging/db-*.dump.gpg` and `storage-*.tar.gz.gpg`, and aborts if the backup fails.
3. **Build.** Builds the images. Set `SKIP_BUILD=1` to use pulled ones.
4. **Start.** Runs `docker compose -p moshina-bor-staging up -d --no-build`. The Caddy `edge` profile is enabled automatically when `API_DOMAIN` is set. Migrations run automatically at API start. They are forward-only and additive.
5. **Readiness.** Waits up to 120 s for `/v1/health/ready`.
6. **History.** Records the version in `.deploy-history-staging`, which `rollback.sh` uses.

If readiness fails, the script prints the exact rollback command. See [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md).

**First admin.** Create a Super Admin once:

```sh
read -r ADMIN_EMAIL; read -r ADMIN_NAME; stty -echo; read -r ADMIN_PASSWORD; stty echo   # keeps the password out of shell history
docker compose --env-file .env.staging -p moshina-bor-staging exec -e ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e ADMIN_NAME="$ADMIN_NAME" -e ADMIN_PASSWORD="$ADMIN_PASSWORD" -e ADMIN_ROLE=SUPER_ADMIN \
  api /usr/local/bin/entrypoint.sh create-admin
```

Do not reuse production administrator passwords.

## 6. Restrict the pilot to invited users

Staging starts **invite-only**: with `DEPLOYMENT_ENVIRONMENT=staging`, `access.registrationMode` defaults to **allowlist** until an administrator explicitly changes it. A fresh public deployment therefore never accepts, or sends SMS to, numbers that were not invited. (Production keeps `open` as its default.)

1. In the admin panel, check that **Settings → General** shows `access.registrationMode` = **allowlist**. Changing it requires `settings.manage`, which only Super Admin has by default, and the change is audited.
2. Open **Settings → Pilot access** and add each pilot tester's phone number. Adding and removing numbers requires `users.manage`. Every change is written to the audit log as `access.invite` / `access.uninvite`, with the phone number masked.
3. Uninvited numbers receive `403 PILOT_ACCESS_ONLY` **before** any SMS is sent, so no SMS cost is incurred. The app shows a localized explanation.
4. Removing a number blocks new sign-ins. To end an existing session immediately, use **Users → Restrict** as well.

## 7. Operate

### Monitoring

Run `monitor.sh` every 5 minutes from cron:

```cron
*/5 * * * * cd /srv/moshinabor/infrastructure/deployment && ./monitor.sh .env.staging >> monitor.log 2>&1
```

`monitor.sh` checks:

- every container is running and healthy (`starting` is accepted), including `edge` when `API_DOMAIN` is set;
- `/v1/health/ready` answers inside the stack;
- `https://<API_DOMAIN>/v1/health/ready` answers through DNS, TLS (full certificate verification) and the edge;
- the TLS certificate is valid for more than 14 more days;
- error-level log lines in the last 5 minutes stay at or below `ERROR_THRESHOLD` (default 5);
- a backup newer than 26 h exists;
- the disks holding the deployment and Docker data are below `DISK_THRESHOLD` (default 85 %);
- whether maintenance mode is switched on, as a reminder.

On a problem it POSTs `{"text": …}` to `ALERT_WEBHOOK_URL` and exits 1. That format works with Slack and Mattermost incoming webhooks, and with a Telegram relay.

Also add an **external** uptime check, such as UptimeRobot or Better Stack, against `https://staging.moshinabor.uz/v1/health/live`. `monitor.sh` cannot alert if the whole host is down.

**Error monitoring.** The API writes structured JSON logs (pino), with secrets, tokens, codes and cookies redacted. `monitor.sh` alerts on bursts of errors. No third-party error tracker (Sentry or similar) is wired in, because that would need an account and a DSN. Adding one is an operator decision; see REMAINING_RISKS.md.

### Emergency maintenance mode

In the admin panel, open **Settings → General** and set `app.maintenanceMode` = **On**. You are asked to confirm, and you can optionally set `app.maintenanceMessage`.

While it is on:

- every mobile API call answers `503 MAINTENANCE_MODE` within about 10 s (the settings cache TTL), and the app shows the message;
- the admin panel, health endpoints, `/v1/app-config` and the SMS webhooks keep working;
- the admin shows a red "maintenance ON" bar;
- every change is audited.

### Backups

The `backup` container writes an encrypted dump every `BACKUP_INTERVAL_SECONDS` and keeps it for `BACKUP_RETENTION_DAYS`. `deploy.sh` additionally takes one before every deployment. Copy `backups-staging/` off the host regularly, for example with rclone to object storage. To restore, see [ROLLBACK_PLAN.md §4](ROLLBACK_PLAN.md#4-restore-a-backup).

## 8. Behind an existing load balancer instead of Caddy

If TLS terminates at a cloud load balancer, leave `API_DOMAIN` empty so that `deploy.sh` does not start Caddy, and replicate the edge rules on the load balancer:

1. Send `staging.moshinabor.uz` traffic **only** for `/v1/*` to `127.0.0.1:8081`, the admin nginx, which proxies `/v1` to the API. Answer `/v1/admin*`, `/docs*` and everything else with 404.
2. Serve `admin-staging.moshinabor.uz` only to the operator IP ranges; deny everything else.
3. Send `X-Forwarded-For` and set `TRUST_PROXY` to the number of proxies in front of the API: load balancer + nginx = 2.
4. Apply HSTS and the security headers. The `security_headers` snippet in `caddy/Caddyfile` lists them.

## 9. Configuration inspection (TASK 3), 2026-11-09

Each item below was inspected in the committed configuration and, where marked, checked against the running sandbox stack.

| Requirement                        | Result                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No development secrets in the repo | ✅ Templates contain empty values only. The API refuses to start with missing, short (<32), duplicate, placeholder or `test-`/`e2e-`/`dev-` secrets (`env.spec.ts`). `check-config.sh` repeats the check before deployment.                                                                                                                |
| No test credentials                | ✅ No admin is seeded in production or staging; the first admin is created interactively. The Playwright and e2e credentials exist only in the test harness against `*_test`/`*_e2e` databases.                                                                                                                                            |
| No debug mode                      | ✅ Images run with `NODE_ENV=production` and `LOG_LEVEL=info`. The `log` SMS provider is refused in production mode. Error bodies carry no stack traces (`security.e2e-spec.ts`).                                                                                                                                                          |
| Database ports not exposed         | ✅ postgres and redis have no `ports:` in compose. In the running sandbox stack, `docker ps` showed only the edge (80/443) and admin nginx on `127.0.0.1` published.                                                                                                                                                                       |
| Swagger disabled in production     | ✅ `SWAGGER_ENABLED` defaults to false when `NODE_ENV=production`, and `check-config.sh` fails if it is true. The edge also answers `/docs` with 404 (verified).                                                                                                                                                                           |
| CORS                               | ✅ Explicit https allow-list (the admin origin only); wildcards are refused at startup and by `check-config.sh`. The mobile app is not a browser and does not need CORS.                                                                                                                                                                   |
| Secure cookies                     | ✅ The admin refresh cookie is `HttpOnly; Secure; SameSite=Strict`, scoped to the refresh path, with a CSRF header required. Verified with curl through the HTTPS edge. The mobile app keeps its tokens in SecureStore and uses no cookies.                                                                                                |
| Security headers                   | ✅ API: Helmet headers (HSTS, nosniff, frame protection). Admin: nginx CSP `default-src 'self'`, X-Frame-Options, Referrer-Policy and Permissions-Policy on every location. Edge: HSTS and the same headers again.                                                                                                                         |
| Admin panel access                 | ✅ The admin API is not reachable on the public API host (404, verified). The admin host is IP-allow-listed (403 from outside, verified). Argon2id, lockout, RBAC on every route, audit log.                                                                                                                                               |
| Time zone                          | ✅ Containers `TZ=Asia/Tashkent`; the database `timezone` reported `Asia/Tashkent` in the running stack; reminder scheduling uses `Asia/Tashkent` explicitly (unit-tested in `dates.test.ts`).                                                                                                                                             |
| Backup encryption                  | ✅ GnuPG symmetric AES-256 encryption. The container refuses to write plaintext when `BACKUP_REQUIRE_ENCRYPTION=true`, which `check-config.sh` makes mandatory. Files are mode 0600. A restore from an encrypted dump was verified in the rollback drill.                                                                                  |
| Workers                            | ✅ A separate `worker` container (same image, started with the `worker` command) runs reminders, push receipts and account purge. `monitor.sh` alerts if it stops (verified by stopping it).                                                                                                                                               |
| Pre-existing defect found          | ⚠️→✅ `.gitignore` pattern `.env.*` had silently kept `.env.production.example` out of git since the first build, so the documented template did not exist in the repo. Fixed by un-ignoring `*.example` templates; both templates are now tracked.                                                                                        |
| Mobile release URL                 | ⚠️→✅ A production `expo export` run after a pilot export inlined the **staging** URL from Metro's transform cache. Fixed: the app reads the URL from the build manifest (`extra.apiUrl`, which is never cached), and the export scripts use `--clear`. Re-export verified to carry the production URL. Regression test: `config.test.ts`. |

## 10. What was verified in the sandbox

The stack was run as project `moshina-bor-staging`, with Caddy issuing certificates from its own local CA, at `https://staging.localhost:8443` and `https://admin-staging.localhost:8443`.

| Check                                                                            | Result                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `check-config.sh` on the staging file, alone and compared with a production file | CONFIG OK; a deliberately shared secret was detected                           |
| `deploy.sh` first install, then an upgrade with a pre-deployment backup          | both reached ready; encrypted `db-*.dump.gpg` + `storage-*.tar.gz.gpg` written |
| API host: `/v1/health/ready`                                                     | 200 over HTTPS (status `degraded`: SMS not configured)                         |
| API host: `/v1/admin/auth/login`, `/docs`, `/`                                   | 404                                                                            |
| API host: `/v1/vehicles` without a token                                         | 401                                                                            |
| OTP request without Eskiz credentials                                            | 503 `SMS_NOT_CONFIGURED` (no fake success)                                     |
| Admin host from a non-allowed IP / an allowed IP                                 | 403 / 200                                                                      |
| Admin login cookie                                                               | `HttpOnly; Secure; SameSite=Strict`                                            |
| Maintenance mode on                                                              | mobile endpoints 503, admin still working, action audited                      |
| Allowlist mode with an uninvited / invited number                                | 403 `PILOT_ACCESS_ONLY` / passes to the SMS step (503, no credentials)         |
| `rollback.sh` to the previous version with `--restore-db`                        | ready; data restored to the pre-deployment state                               |
| `monitor.sh` with the worker stopped / healthy                                   | alert delivered to a webhook receiver, exit 1 / OK, exit 0                     |

**Not verified:** a real public deployment, real ACME certificates, real Eskiz SMS, real FCM/APNs push, and behaviour on real devices.

## Required external credentials

| Item                                                                                                                    | Needed for          |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Server, DNS for both hostnames, firewall                                                                                | anything public     |
| Eskiz.uz account (email/password), approved sender and **approved SMS template** for the OTP text                       | sign-in             |
| Expo account + EAS project (`eas init`), `EXPO_ACCESS_TOKEN`                                                            | builds and push     |
| Firebase project with Android app `uz.moshinabor.app.pilot` (FCM V1 service-account key uploaded to EAS)                | Android push        |
| Apple Developer Program, App ID `uz.moshinabor.app.pilot`, APNs key (managed by EAS), test devices' UDIDs or TestFlight | iOS builds and push |
| Operator IP ranges for the admin allow-list                                                                             | admin access        |
| Alert webhook URL (Slack, Telegram relay, …) and an external uptime monitor                                             | monitoring          |
| Off-host backup storage                                                                                                 | disaster recovery   |
