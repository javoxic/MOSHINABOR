# External dependencies — first public staging deployment

This is the checklist of everything outside the repository that the first real staging deployment needs. **No item in this list has been configured.** No credential exists in this repository or in the sandbox. Each item says what to obtain, where it goes, and how to verify it once it exists.

Status values used here and in [GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md):

| Status                               | Meaning                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| **Verified**                         | Proven by an automated test or a sandbox drill on 2026-11-09                       |
| **Prepared but not verified**        | Code, configuration and commands exist; they have not run against the real service |
| **Blocked by external credentials**  | Cannot proceed until the account or credential exists                              |
| **Requires physical device testing** | Only a real phone can prove it                                                     |

## Setup guides (onboarding package)

| Guide                                                    | Covers                                                                                                 | Owner role                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| [VPS_SETUP_GUIDE.md](VPS_SETUP_GUIDE.md)                 | Server spec, Ubuntu, SSH hardening, firewall, Docker, DNS, HTTPS verification                          | Server operator                        |
| [SMS_PROVIDER_SETUP.md](SMS_PROVIDER_SETUP.md)           | Eskiz account, sender, template approval, env mapping, safe test, delivery and failure checks          | SMS provider contact + server operator |
| [MOBILE_PUSH_SETUP.md](MOBILE_PUSH_SETUP.md)             | Expo/EAS, Firebase (FCM v1), Apple (APNs, ad-hoc, TestFlight), pilot build commands, push verification | Mobile release administrator           |
| [BACKUP_MONITORING_SETUP.md](BACKUP_MONITORING_SETUP.md) | Off-server encrypted backups, retention, restore proof, uptime monitors, alert webhook                 | Server operator                        |
| [OPERATOR_HANDOVER.md](OPERATOR_HANDOVER.md)             | Who does what, what is handed back, dependency order                                                   | All, release owner                     |
| [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md)           | The deployment itself                                                                                  | Server operator                        |

Secrets are never pasted into chat, tickets, commits or shell history. On the server they live only in `infrastructure/deployment/.env.staging` (mode 600) and `infrastructure/deployment/secrets/` (mode 600). Both are git-ignored, and `check-config.sh` checks their permissions and strength.

## Summary

| #   | Dependency                             | Owner action                                                                      | Status                                                 |
| --- | -------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | VPS / server and SSH access            | Rent the server, create the deploy user and SSH key ([guide](VPS_SETUP_GUIDE.md)) | Blocked by external credentials                        |
| 2   | DNS records                            | Create A records for both hostnames                                               | Blocked by external credentials                        |
| 3   | HTTPS certificates                     | Automatic (Caddy + Let's Encrypt) once 1 and 2 exist                              | Prepared but not verified                              |
| 4   | Eskiz SMS                              | Account, sender approval, OTP template approval ([guide](SMS_PROVIDER_SETUP.md))  | Blocked by external credentials                        |
| 5   | Expo / EAS project                     | Create the project; set the project ID ([guide](MOBILE_PUSH_SETUP.md))            | Blocked by external credentials                        |
| 6   | Firebase (Android push)                | Create the Android app for the pilot package; FCM V1 key                          | Blocked by external credentials                        |
| 7   | Apple Developer (iOS push, TestFlight) | Membership, App ID, APNs key, testers                                             | Blocked by external credentials                        |
| 8   | Alert webhook                          | Create an incoming webhook                                                        | Blocked by external credentials                        |
| 9   | External uptime monitoring             | Create the monitors                                                               | Blocked by external credentials                        |
| 10  | Off-server encrypted backup storage    | Bucket, upload key, restore key ([guide](BACKUP_MONITORING_SETUP.md))             | Blocked by external credentials                        |
| 11  | Operator IP addresses                  | List fixed office or VPN egress IPs                                               | Blocked by external credentials (operator information) |
| 12  | Repository access from the server      | Read-only deploy key for `javoxic/MOSHINABOR`                                     | Blocked by external credentials                        |

## 1. VPS / server and SSH access

| Requirement | Detail                                                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Size        | 2 vCPU, 4 GB RAM, 40 GB SSD minimum. Images are built on the server: the API image is about 850 MB.                                                                                                                           |
| OS          | Ubuntu 24.04 LTS (the runbook commands assume it), x86_64                                                                                                                                                                     |
| Location    | Close to Uzbekistan for latency, e.g. a Tashkent provider, or Frankfurt or Istanbul                                                                                                                                           |
| Network     | A static public IPv4 address. Ports 80 and 443 reachable from the internet; port 22 only from operator IPs.                                                                                                                   |
| IPv6        | Optional. Only publish an AAAA record if Docker's IPv6 NAT (`ip6tables`) is enabled; otherwise IPv6 clients reach Caddy through docker-proxy and appear to come from the Docker network, so the admin IP filter rejects them. |
| SSH         | Key-only login for a non-root `deploy` user in the `docker` group; `PasswordAuthentication no`; `PermitRootLogin no`                                                                                                          |
| Separation  | A dedicated host for staging. Production must not run on the same host.                                                                                                                                                       |

**Verify:** `ssh deploy@<ip> 'docker version && docker compose version'` works from an operator IP and fails from anywhere else. Step-by-step: [VPS_SETUP_GUIDE.md](VPS_SETUP_GUIDE.md).

## 2. DNS records

Full guide: [VPS_SETUP_GUIDE.md §7–§8](VPS_SETUP_GUIDE.md).

| Name                          | Type | Value           | TTL |
| ----------------------------- | ---- | --------------- | --- |
| `staging.moshinabor.uz`       | A    | `<server IPv4>` | 300 |
| `admin-staging.moshinabor.uz` | A    | `<server IPv4>` | 300 |

- If the `moshinabor.uz` zone has a CAA record, it must allow `letsencrypt.org`.
- **Verify:** `getent ahosts staging.moshinabor.uz` returns the server IP. `verify-public.sh` checks this with `EXPECTED_IP`.

## 3. HTTPS certificates

- Caddy (`edge` service, `caddy:2.10-alpine`) obtains and renews Let's Encrypt certificates automatically. It needs DNS (§2), ports 80/443 open, and `ACME_EMAIL` set to a monitored mailbox.
- `check-config.sh` refuses to deploy with Caddy's internal CA (`local_certs`), the Let's Encrypt staging CA, non-standard edge ports, or localhost or example hostnames. The sandbox certificates used in rehearsals can therefore never reach a real deployment.
- Certificates persist in the `caddydata` volume. Do not delete it: Let's Encrypt rate-limits re-issuance.
- **Verify:** `verify-public.sh` connects with full certificate verification. `monitor.sh` alerts when fewer than 14 days of validity remain.
- **Status:** Prepared but not verified. In the sandbox, the verifier rejected the local-CA certificate (curl error 60) as intended. No public certificate has been issued.

## 4. Eskiz SMS

Full guide: [SMS_PROVIDER_SETUP.md](SMS_PROVIDER_SETUP.md).

| Item                                    | Where it goes                                          | Note                                                                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eskiz account login e-mail and password | `ESKIZ_EMAIL`, `ESKIZ_PASSWORD` in `.env.staging`      | Prefer a separate account, or at least a low balance, for staging                                                                                                                                                                                     |
| Sender name                             | `ESKIZ_FROM`                                           | `4546` (Eskiz default) works without approval; a branded alpha sender needs Eskiz approval                                                                                                                                                            |
| **Approved OTP templates**              | `SMS_OTP_TEMPLATE_UZ/RU/EN` (optional; defaults below) | Eskiz only delivers texts that match an approved template. Submit the exact texts below, or your own with `{code}`, and set the env variables to the approved wording.                                                                                |
| Delivery callback                       | Automatic                                              | Eskiz calls `https://staging.moshinabor.uz/v1/webhooks/sms/eskiz?secret=…`, using `SMS_CALLBACK_SECRET`. That path is public through the edge. The secret is redacted in API logs and no longer written to nginx access logs (fixed in this release). |

Default templates, as defined in `backend/src/config/env.ts`:

- `MOSHINA BOR: tasdiqlash kodi {code}. Kodni hech kimga bermang.`
- `MOSHINA BOR: код подтверждения {code}. Никому не сообщайте код.`
- `MOSHINA BOR: your verification code is {code}. Do not share it.`

Until the credentials are set, sign-in answers `503 SMS_NOT_CONFIGURED`. Nothing pretends an SMS was sent.

**Verify** (with explicit authorization, to a tester's own invited number):

1. Request a code in the pilot app.
2. Confirm that the SMS arrives.
3. Admin → Settings → System health shows the SMS provider as configured, and the verification becomes `DELIVERED` after Eskiz's callback.

**Status:** Blocked by external credentials. The provider adapter is tested only against simulated HTTP responses.

## 5. Expo / EAS project

Full guide, for §5–§7: [MOBILE_PUSH_SETUP.md](MOBILE_PUSH_SETUP.md).

| Item                                    | Where it goes                                                                                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expo account (organisation recommended) | `eas login` on the build machine                                                                                                                                                                                          |
| EAS project                             | `cd mobile && eas init` → project ID                                                                                                                                                                                      |
| `EAS_PROJECT_ID`                        | Locally: shell variable. Cloud builds: `eas env:create --name EAS_PROJECT_ID --value <id> --environment preview --visibility plaintext` (pilot profiles use the EAS environment `preview`; production uses `production`). |
| `EXPO_ACCESS_TOKEN` (optional)          | `.env.staging` on the server, only if "enhanced push security" is enabled in the Expo project                                                                                                                             |

The app reads its project ID from `EAS_PROJECT_ID` (`app.config.ts` is dynamic, so `eas init` cannot write it). Without the ID, push registration reports "unavailable" and never fakes a token.

`eas.json` is validated with `@expo/eas-json` 16.30.0:

- profiles `pilot` (internal APK + ad-hoc iOS), `pilot-testflight` (store) and `production`;
- versioning via `appVersionSource: remote` with `autoIncrement`;
- the unused `development` profile was removed: it required `expo-dev-client`, which is not installed.

**Status:** `eas.json` is Verified. The EAS project is Blocked by external credentials.

## 6. Firebase (Android push)

1. Create a Firebase project and add an **Android app with package `uz.moshinabor.app.pilot`**. The production app `uz.moshinabor.app` is a separate app.
2. Download `google-services.json` and store it as an EAS file variable. It is not committed:
   `eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment preview --visibility sensitive`
3. Create an FCM V1 service-account key and upload it with `eas credentials` → Android → `uz.moshinabor.app.pilot` → Push Notifications (FCM V1).

**Verify:** on a physical Android phone, allow notifications and send an admin announcement. The push arrives, and Admin → Notifications shows `SENT` → `DELIVERED`.

**Status:** Blocked by external credentials; then Requires physical device testing.

## 7. Apple Developer (iOS push, TestFlight, device registration)

1. Join the Apple Developer Program (organisation account, D-U-N-S number for a company).
2. Register the App ID `uz.moshinabor.app.pilot` with the Push Notifications capability. EAS can do this on the first build.
3. APNs: let `eas credentials` create and manage the APNs key.
4. Distribution, either:
   - **ad-hoc:** register each tester iPhone with `eas device:create`, then build with `--profile pilot`; or
   - **TestFlight:** create the app record in App Store Connect, build with `--profile pilot-testflight`, then `eas submit`. External TestFlight testers need Beta App Review.

**Verify:** install on a physical iPhone; push as in §6.

**Status:** Blocked by external credentials; then Requires physical device testing.

## 8. Alert webhook

- Create a Slack or Mattermost incoming webhook, or a Telegram relay that accepts `{"text": "…"}`.
- Put it in `ALERT_WEBHOOK_URL`. It must be https; `check-config.sh` refuses to deploy without one.
- **Verify:** send the test alert, then run the outage drill (stop the worker, run `./monitor.sh`, start it again). The commands are in [BACKUP_MONITORING_SETUP.md §7](BACKUP_MONITORING_SETUP.md).
- **Status:** delivery to a local receiver is Verified (sandbox drill: API outage and certificate alerts delivered as JSON). The real webhook is Blocked by external credentials.

## 9. External uptime monitoring

`monitor.sh` runs on the server and cannot report a dead server. Create, for example in UptimeRobot, Better Stack or Healthchecks.io:

| Monitor        | Target                                                                   | Interval | Expect           |
| -------------- | ------------------------------------------------------------------------ | -------- | ---------------- |
| API liveness   | `https://staging.moshinabor.uz/v1/health/live`                           | 1–5 min  | HTTP 200         |
| API readiness  | `https://staging.moshinabor.uz/v1/health/ready`                          | 5 min    | HTTP 200         |
| Certificate    | `staging.moshinabor.uz:443`                                              | daily    | expiry > 14 days |
| Cron heartbeat | appended to the `monitor.sh` cron line; only pinged when all checks pass | 5 min    | ping received    |

Alerts go to the same channel as §8. Full setup: [BACKUP_MONITORING_SETUP.md §6](BACKUP_MONITORING_SETUP.md). **Status:** Blocked by external credentials.

## 10. Off-server encrypted backup storage

- Backups are already encrypted on the server with GnuPG AES-256 (`backups-staging/*.gpg`, mode 600). Only the encrypted files leave the host.
- Create an S3-compatible bucket, e.g. Backblaze B2, Wasabi or a provider in Uzbekistan:
  - versioning on, with a lifecycle rule: current files 35 days, previous versions 7 days;
  - an **upload key** (list + put on that bucket only, no delete) for the server;
  - a **restore key** (list + get) kept only in the password manager.
- Configure `rclone` on the server (`rclone config`, stored in `~deploy/.config/rclone/rclone.conf`, mode 600). Copy every 6 h with `rclone copy backups-staging staging-backups:<BUCKET_NAME>/staging --include '*.gpg' --immutable --s3-no-check-bucket`.
- Store the **backup passphrase** (`secrets/staging_backup_passphrase`) in the team password manager, **not** in the bucket. Without it, the backups are unreadable.
- **Verify:**
  - weekly, automatically: `./verify-backup.sh .env.staging` restores the newest backup into a network-less throw-away container and alerts on failure;
  - monthly: the same check with files downloaded from the bucket.
- Full setup and retention policy: [BACKUP_MONITORING_SETUP.md](BACKUP_MONITORING_SETUP.md).
- **Status:**
  - on-host encryption, `verify-backup.sh`, and the rclone upload → download → restore loop (against a local S3 emulator with the server's rclone 1.60.1) are Verified;
  - the real bucket and the key permission boundaries are Blocked by external credentials.

## 11. Operator IP addresses

- `ADMIN_ALLOWED_IPS="<ip>/32 …"`: fixed office or VPN egress addresses, quoted and space-separated.
- `check-config.sh` refuses entries that are:
  - `0.0.0.0/0`;
  - broader than /16;
  - the template's documentation addresses;
  - in Docker's `172.16.0.0/12`.
- **Verify:** `verify-public.sh … allowed` from an allowed IP, and `verify-public.sh … denied` from a phone hotspot.

## 12. Repository access from the server

Add a read-only deploy key to `javoxic/MOSHINABOR` (GitHub → Settings → Deploy keys) for the server's `deploy` user. Do not use a personal token. The server checks out an exact commit; see [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md).
