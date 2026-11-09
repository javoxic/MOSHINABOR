# Production checklist

Complete these steps in order. Items marked ⛔ block launch.

## 1. Accounts and credentials

- [ ] ⛔ **Eskiz.uz:** create the account and obtain an email/password login.
  - Request a sender ID: `4546` by default, or your own alpha name.
  - Submit the OTP template for moderation. It must contain the code and match the server text **exactly**, including punctuation. The defaults are below; set `SMS_OTP_TEMPLATE_UZ/RU/EN` if you submit different texts:
    - `MOSHINA BOR: tasdiqlash kodi {code}. Kodni hech kimga bermang.`
    - `MOSHINA BOR: код подтверждения {code}. Никому не сообщайте код.`
    - `MOSHINA BOR: your verification code is {code}. Do not share it.`
  - Keep enough balance on the account.
- [ ] (Optional) **Twilio**, if users with non-Uzbek numbers must sign in: Account SID, Auth Token, and a sender number or Messaging Service. Then set `SMS_INTERNATIONAL_PROVIDER=twilio`.
- [ ] ⛔ **Expo/EAS:** run `eas init` and record the project ID in `EAS_PROJECT_ID`. Optionally set `EXPO_ACCESS_TOKEN` with enhanced push security enabled.
- [ ] ⛔ **Firebase:** create a project and add an Android app with your package name. Store `google-services.json` as an EAS file secret and upload the FCM V1 service-account key with `eas credentials`.
- [ ] ⛔ **Apple Developer** membership. Let EAS create the APNs key and distribution certificates.
- [ ] Google Play Console and App Store Connect app records, with privacy policy URLs.

## 2. Server

- [ ] A Linux host with Docker 24+ and Compose v2. DNS for the admin/API hostname.
- [ ] A TLS reverse proxy (Caddy, nginx or a load balancer) forwarding to `127.0.0.1:8080`. Redirect HTTP to HTTPS.
- [ ] `cd infrastructure/deployment && cp .env.production.example .env`, then fill in **every** value:
  - Unique secrets from `openssl rand -base64 48` for `JWT_ACCESS_SECRET`, `JWT_ADMIN_SECRET`, `OTP_PEPPER`, `SMS_CALLBACK_SECRET`, `POSTGRES_PASSWORD` and `REDIS_PASSWORD`. Startup refuses test or placeholder values.
  - `API_PUBLIC_URL` must be the public HTTPS origin; Eskiz delivery callbacks use it.
  - `CORS_ORIGINS`: the admin origin.
  - `TRUST_PROXY`: the number of proxies in front of the API. With an edge proxy plus the admin nginx, that is `2`.
  - `SWAGGER_ENABLED`: leave unset. It is off in production.
- [ ] ⛔ Create the backup passphrase. **Store a copy in your password manager**: encrypted backups cannot be restored without it.

  ```bash
  mkdir -p secrets && openssl rand -base64 48 > secrets/backup_passphrase && chmod 600 secrets/backup_passphrase
  ```

- [ ] `docker compose up -d --build`, then check that `docker compose ps` shows every service as healthy.
- [ ] Create named administrator accounts (no shared accounts):

  ```bash
  docker compose exec -e ADMIN_EMAIL=… -e ADMIN_NAME=… -e ADMIN_PASSWORD=… -e ADMIN_ROLE=SUPER_ADMIN api /usr/local/bin/entrypoint.sh create-admin
  ```

## 3. Verify the live system

- [ ] `https://<host>/v1/health/ready` returns `{"ok":true,...}`.
- [ ] Admin → Settings → System health: database OK, Redis OK, **SMS provider: configured**, storage writable.
- [ ] Request an OTP for a real test phone. The SMS should arrive within 30 s. _Last successful send_ updates. The delivery report reaches `/v1/webhooks/sms/eskiz` and the verification shows `DELIVERED`.
- [ ] Sign in on a real Android and a real iPhone. Then add a vehicle, upload a photo (including an iPhone HEIC photo), create a schedule, mark it done, add an expense, and check the dashboard.
- [ ] Push: allow notifications on both devices. In Admin → Notifications → Scheduled, use _Run reminder engine now_ with a test account that has an overdue schedule. Confirm the push arrives, the history shows `SENT` → `DELIVERED`, and tapping it opens the schedule.
- [ ] Run a manual backup:

  ```bash
  docker compose exec backup sh /scripts/backup.sh once
  ```

  Then confirm `*.dump.gpg` and `*.tar.gz.gpg` exist, and **test a restore on a separate staging host**.

- [ ] Set the support phone and email, and review the reminder thresholds, in Admin → Settings.

## 4. Operations

- [ ] Copy backups off-host daily to versioned, access-restricted object storage. Run a restore drill every quarter.
- [ ] Ship logs (JSON on stdout) to a log platform. Set alerts for:
  - readiness failures;
  - push queue failed jobs > 0;
  - SMS last error changes;
  - disk usage above 80 %;
  - SMS spend spikes.
- [ ] Review the audit log weekly. Remove admin access promptly when staff leave.
- [ ] Apply OS and Docker security updates. Run `pnpm audit --prod` monthly; CI already gates on critical findings.
- [ ] Commission an independent penetration test before the public launch.

## 5. Mobile release

- [ ] Set `EXPO_PUBLIC_API_URL` in the `eas.json` production profile to your domain.
- [ ] Bump `version`, `IOS_BUILD_NUMBER` and `ANDROID_VERSION_CODE`.
- [ ] `eas build --platform all --profile production`, then `eas submit`.
- [ ] Do the manual device test pass in REMAINING_RISKS.md before promoting the release from internal testing.
