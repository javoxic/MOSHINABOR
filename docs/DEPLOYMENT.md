# Deployment

> For the staging environment and the controlled pilot, see [STAGING_DEPLOYMENT.md](STAGING_DEPLOYMENT.md). For production, the same scripts apply with `.env`: `./check-config.sh .env`, `./deploy.sh .env <version>` (encrypted pre-deployment backup plus a readiness gate), `./rollback.sh .env <version>` ([ROLLBACK_PLAN.md](ROLLBACK_PLAN.md)) and `./monitor.sh .env` from cron. The bundled Caddy edge (started by `deploy.sh` when `API_DOMAIN` is set) provides TLS, hides the admin API and `/docs` on the public API host, and IP-restricts the admin host.

## External services and credentials

| Service                         | Needed for                             | What to obtain                                                                                                                                                               | Where to put it                                                            | Status in this repo                                                                                         |
| ------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Eskiz.uz**                    | SMS OTP to +998 numbers (sign-in)      | Eskiz account (email + password), sender ID (`4546` default or an approved alpha name), **OTP template approved in the Eskiz cabinet** matching `SMS_OTP_TEMPLATE_*` exactly | `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, `ESKIZ_FROM`, `SMS_OTP_TEMPLATE_UZ/RU/EN` | Integration implemented (login + token cache + re-auth, send, delivery callbacks); **awaiting credentials** |
| Twilio (optional)               | SMS to non-Uzbek numbers               | Account SID, Auth Token, sender number or Messaging Service SID                                                                                                              | `SMS_INTERNATIONAL_PROVIDER=twilio`, `TWILIO_*`                            | Implemented; optional                                                                                       |
| **Expo / EAS**                  | Push tokens, store builds, OTA updates | Expo account, EAS project (`eas init`)                                                                                                                                       | `EAS_PROJECT_ID` (mobile build env); optional `EXPO_ACCESS_TOKEN` (API)    | Implemented; **awaiting project**                                                                           |
| **Firebase (FCM)**              | Android push delivery                  | Firebase project → `google-services.json`, FCM V1 service-account key uploaded to EAS (`eas credentials`)                                                                    | EAS secret file `GOOGLE_SERVICES_JSON`                                     | Awaiting                                                                                                    |
| **Apple Developer**             | iOS builds + APNs                      | Apple Developer Program membership; EAS manages certificates and the APNs key                                                                                                | `eas credentials`                                                          | Awaiting                                                                                                    |
| Google Play / App Store Connect | Store distribution                     | Developer accounts, app records                                                                                                                                              | `eas submit`                                                               | Awaiting                                                                                                    |

Until Eskiz is configured, `POST /v1/auth/otp/request` returns `503 SMS_NOT_CONFIGURED` and the admin
**Settings → System health** page shows the SMS provider as not configured. Nothing pretends to succeed.

**Verifying SMS after configuration:** request a code for a real test phone in the app (or
`curl -X POST https://<host>/v1/auth/otp/request -H 'content-type: application/json' -d '{"phone":"+998…"}'`),
confirm the SMS arrives, and check _System health → Last successful send_. Delivery reports arrive at
`/v1/webhooks/sms/eskiz?secret=…` (set `API_PUBLIC_URL` to the public HTTPS origin).

## Server deployment (Docker Compose, single host)

Requirements: Linux host with Docker 24+ and Compose v2, a domain with DNS, a TLS reverse proxy
(Caddy, nginx, Traefik or a cloud load balancer). 2 vCPU / 4 GB RAM is sufficient to start.

```bash
git clone <repo> moshina-bor && cd moshina-bor/infrastructure/deployment
cp .env.production.example .env
# Fill every value; generate secrets with: openssl rand -hex 32 (URL-safe)
mkdir -p secrets && openssl rand -base64 48 > secrets/backup_passphrase && chmod 600 secrets/backup_passphrase
# ^ keep a copy of the passphrase in your password manager — encrypted backups need it to restore
docker compose up -d --build
docker compose ps                 # all services healthy
docker compose exec -e ADMIN_EMAIL=you@company.uz -e ADMIN_NAME="Your Name" \
  -e ADMIN_PASSWORD='Unique-Strong-Passw0rd' -e ADMIN_ROLE=SUPER_ADMIN api /usr/local/bin/entrypoint.sh create-admin
```

Services: `postgres`, `redis` (password, AOF persistence), `api` (runs `prisma migrate deploy` + seed
on start), `worker` (cron + push queue), `admin` (nginx serving the SPA and proxying `/v1` and `/docs`
to the API, bound to `HTTP_BIND`, default `127.0.0.1:8080`), `backup`.

TLS proxy example (Caddy):

```
admin.moshinabor.uz {
  reverse_proxy 127.0.0.1:8080
}
```

The mobile app uses the same origin (`EXPO_PUBLIC_API_URL=https://admin.moshinabor.uz`) or a separate
API hostname routed to the same nginx. Set `API_PUBLIC_URL` and `CORS_ORIGINS` accordingly and
`TRUST_PROXY=2` (edge proxy + admin nginx).

Building behind a TLS-intercepting corporate proxy: `docker build --secret id=extra_ca,src=/path/ca.crt …`.

### Updates

```bash
git pull && docker compose up -d --build   # API applies new migrations on start
```

Migrations are forward-only; take a backup (`docker compose exec backup sh /scripts/backup.sh once`) before upgrading.

### Backups and restore

Automatic daily backups land in `BACKUP_DIR` as `db-*.dump.gpg` and `storage-*.tar.gz.gpg` (AES-256,
mode 0600, 14-day retention). `restore.sh` decrypts them with `secrets/backup_passphrase`.
Copy them off-host (e.g. `rclone`/`aws s3 sync` to versioned, encrypted object storage via cron).

```bash
docker compose stop api worker
./restore.sh backups/db-YYYYmmdd-HHMMSS.dump.gpg backups/storage-YYYYmmdd-HHMMSS.tar.gz.gpg
docker compose up -d api worker
```

### Monitoring

- Liveness `GET /v1/health/live`, readiness `GET /v1/health/ready` (DB + Redis) — container healthchecks use them.
- Admin → Settings → System health: DB latency/migrations, Redis, SMS provider status and last error, push queue, storage.
- Logs are structured JSON (pino) on stdout with request IDs; ship them to your log platform. Secrets,
  cookies, tokens and OTP codes are redacted.
- Alert on: readiness failures, `push` queue failed jobs, SMS last error, disk usage of `pgdata`/`storage`/`backups`.

### Scaling

`api` is stateless (scale horizontally behind the proxy). Run one or more `worker` replicas (jobs are
locked in Redis). For multiple hosts, move uploaded files to shared storage (network volume) and use
managed PostgreSQL/Redis.

## Mobile builds

Configuration lives in `mobile/app.config.ts` and `mobile/eas.json`; values come from environment
variables (`mobile/.env.example`).

One-time setup:

```bash
npm i -g eas-cli
cd mobile
eas login
eas init                      # creates the EAS project → put its id in EAS_PROJECT_ID
eas secret:create --scope project --name EAS_PROJECT_ID --value <id>
eas secret:create --scope project --type file --name GOOGLE_SERVICES_JSON --value ./google-services.json
eas credentials               # Android keystore + FCM V1 key; iOS certificates + APNs key (EAS can generate)
```

Set the API URL per profile in `eas.json` (`env.EXPO_PUBLIC_API_URL`) — `production` points to
`https://api.moshinabor.uz`; change it to your domain.

### Android

```bash
cd mobile
eas build --platform android --profile preview      # installable APK for testers
eas build --platform android --profile production   # AAB for Google Play
eas submit --platform android --profile production  # uploads to the internal track
```

Local build alternative (Android SDK + JDK 17): `npx expo prebuild --platform android && cd android && ./gradlew bundleRelease`.

### iOS

```bash
cd mobile
eas build --platform ios --profile production       # requires Apple Developer membership
eas submit --platform ios --profile production      # uploads to App Store Connect / TestFlight
```

Local build alternative (macOS + Xcode 16): `npx expo prebuild --platform ios && cd ios && pod install`,
then archive in Xcode.

Before each store release bump `version` in `app.config.ts`. Build numbers (`buildNumber` / `versionCode`) are managed remotely by EAS (`appVersionSource: remote`, `autoIncrement: true`), so every build gets a new one automatically.
Verification available in CI without credentials: `npx expo export --platform android --platform ios`
(produces the Hermes bundles that go into the binaries).

## Production configuration checklist

The step-by-step launch checklist is [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md).

- [ ] DNS + TLS for the admin/API hostname; HTTP redirected to HTTPS.
- [ ] `.env` filled: unique `JWT_ACCESS_SECRET`, `JWT_ADMIN_SECRET`, `OTP_PEPPER`, `SMS_CALLBACK_SECRET`,
      strong `POSTGRES_PASSWORD` and `REDIS_PASSWORD`.
- [ ] `API_PUBLIC_URL` = public HTTPS origin; `CORS_ORIGINS` = admin origin(s); `TRUST_PROXY` correct.
- [ ] `SWAGGER_ENABLED=false` (or protected).
- [ ] Eskiz credentials + approved template configured; test SMS received; System health shows configured.
- [ ] (Optional) Twilio configured for international numbers.
- [ ] First Super Admin created via `create-admin`; named accounts for each staff member with least-privilege roles.
- [ ] Support phone/email set in Admin → Settings (shown in the app’s Help screen).
- [ ] Reminder thresholds reviewed in Admin → Settings.
- [ ] Backups running, copied off-host, restore tested.
- [ ] Log shipping and alerts configured.
- [ ] EAS project, FCM and APNs credentials configured; production mobile build points to the production API.
- [ ] Privacy policy published (the in-app privacy screen summarizes it) and store listings completed.
