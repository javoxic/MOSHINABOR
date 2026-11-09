# Operator handover — first public staging deployment

This document lists who must do what before MOSHINA BOR staging can serve pilot testers. Every task names its owner role, the guide that explains it, and what has to be handed back. Nothing in this list has been done yet. Until it is, staging is **not deployed** and the pilot is **not live**; see [GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md).

## Roles

| Role                             | Typical person                              | Needs access to                                                                                                            |
| -------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Server operator**              | DevOps / backend lead                       | VPS provider, DNS for `moshinabor.uz`, the server (SSH), storage provider, monitoring and alerting tools, password manager |
| **SMS provider contact**         | Account owner at Eskiz (business / finance) | Eskiz cabinet, the company contract with Eskiz                                                                             |
| **Mobile release administrator** | Mobile lead                                 | Expo organization, Firebase, Apple Developer / App Store Connect, Google Play Console, password manager                    |
| **Device testers**               | QA + pilot testers                          | Physical Android phones and iPhones, their own phone numbers                                                               |
| **Release owner**                | Product / engineering manager               | Final GO / NO-GO; authorizes real SMS and push tests                                                                       |

**Rules for every role:**

- Secrets go only into the password manager and the target system: the server's `.env.staging`, EAS, or the provider dashboard.
- Never put a secret in chat, e-mail, tickets, screenshots or git.
- Hand back **confirmation that a task is done**, never the secret itself.

## 1. Server operator

| #   | Task                                                                                | Guide                                                       | Hand back                                              | Status                          |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------ | ------------------------------- |
| S1  | Rent the VPS (2–4 vCPU, 4–8 GB RAM, 40–80 GB SSD, Ubuntu 24.04, static IPv4)        | [VPS_SETUP_GUIDE.md §1](VPS_SETUP_GUIDE.md)                 | Server IP, provider, region                            | Blocked by external credentials |
| S2  | Base system, `deploy` user, operators' SSH keys                                     | VPS §2–3                                                    | List of operators with access                          | Blocked                         |
| S3  | SSH hardening (`00-moshinabor-hardening.conf`); password login refused              | VPS §4                                                      | `sshd -T` output for the 4 key lines                   | Blocked                         |
| S4  | Firewall: 22 from operator IPs only; 80/443 public                                  | VPS §5                                                      | `ufw status verbose`                                   | Blocked                         |
| S5  | Docker Engine + Compose from the official repository                                | VPS §6                                                      | `docker version`, `docker compose version`             | Blocked                         |
| S6  | DNS A records for `staging` and `admin-staging` (no AAAA); CAA allows Let's Encrypt | VPS §7                                                      | `getent ahosts` output for both                        | Blocked                         |
| S7  | Deploy key, checkout of the release commit                                          | [DEPLOYMENT_RUNBOOK.md §2](DEPLOYMENT_RUNBOOK.md)           | `git log -1` hash                                      | Blocked                         |
| S8  | `.env.staging` + backup passphrase; passphrase copied to the password manager       | Runbook §3                                                  | "Passphrase stored" confirmation                       | Blocked                         |
| S9  | `check-config.sh` → `CONFIG OK` (no `SANDBOX_DRILL`)                                | Runbook §4                                                  | Last line of output                                    | Blocked                         |
| S10 | `deploy.sh`; certificates obtained                                                  | Runbook §5, VPS §8                                          | Edge log line "certificate obtained" for both hosts    | Blocked                         |
| S11 | First Super Admin; named accounts for others                                        | Runbook §6                                                  | List of admin accounts and roles (no passwords)        | Blocked                         |
| S12 | `verify-public.sh` from an allowed IP **and** from a non-allowed network            | Runbook §8                                                  | Both outputs ending `PUBLIC CHECKS PASSED`             | Blocked                         |
| S13 | Alert webhook created; test alert acknowledged; outage drill done                   | [BACKUP_MONITORING_SETUP.md §7](BACKUP_MONITORING_SETUP.md) | Screenshot of the received test alert (no URL visible) | Blocked                         |
| S14 | External uptime monitors + heartbeat                                                | Backup/Monitoring §6                                        | Monitor names, all green                               | Blocked                         |
| S15 | Bucket (versioning, lifecycle, two keys); rclone; first off-server copy             | Backup/Monitoring §2                                        | `rclone lsf` listing (file names only)                 | Blocked                         |
| S16 | Crontab (monitor, off-server copy, weekly restore proof) + logrotate                | Backup/Monitoring §5                                        | `crontab -l`                                           | Blocked                         |
| S17 | Restore proof from the bucket with the restore key                                  | Backup/Monitoring §4                                        | `BACKUP VERIFIED` output                               | Blocked                         |
| S18 | Enter the Eskiz credentials received from the SMS provider contact; redeploy        | [SMS_PROVIDER_SETUP.md §4](SMS_PROVIDER_SETUP.md)           | Health page "SMS configured: yes"                      | Blocked (needs P3)              |
| S19 | Callback path check (fake report → 200; wrong secret → 403)                         | SMS §6                                                      | Output of both commands                                | Blocked                         |
| S20 | Invite pilot tester numbers (Admin → Settings → Pilot access)                       | [STAGING_DEPLOYMENT.md §6](STAGING_DEPLOYMENT.md)           | Count of invited numbers                               | Blocked                         |

## 2. SMS provider contact (Eskiz)

| #   | Task                                                                                                 | Guide                                             | Hand back                                                  | Status                          |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------- | ------------------------------- |
| P1  | Contract / account with Eskiz for the company; API access enabled                                    | [SMS_PROVIDER_SETUP.md §2](SMS_PROVIDER_SETUP.md) | Confirmation; account owner name                           | Blocked by external credentials |
| P2  | Sender name: use `4546`, or apply for a branded sender                                               | SMS §2                                            | Approved sender name                                       | Blocked                         |
| P3  | Submit the 3 OTP templates verbatim; obtain approval                                                 | SMS §3                                            | The **approved wording** (it is not secret), approval date | Blocked                         |
| P4  | Top up the staging balance; set a low-balance notification                                           | SMS §2                                            | Balance amount                                             | Blocked                         |
| P5  | Store the login e-mail and password in the password manager; tell the server operator the entry name | SMS §2                                            | Entry name only                                            | Blocked                         |
| P6  | Authorize the real SMS test: which numbers, how many messages                                        | SMS §5                                            | Written authorization from the release owner               | Blocked                         |

## 3. Mobile release administrator

| #   | Task                                                                                                                                     | Guide                                           | Hand back                                         | Status                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------- | ------------------------------- |
| M1  | Expo organization and EAS project (`eas init`); `EAS_PROJECT_ID` in the EAS `preview` + `production` environments                        | [MOBILE_PUSH_SETUP.md §3](MOBILE_PUSH_SETUP.md) | Project ID (not secret)                           | Blocked by external credentials |
| M2  | Firebase project; Android app `uz.moshinabor.app.pilot`; `GOOGLE_SERVICES_JSON` as an EAS file variable; FCM V1 key uploaded             | Mobile §4                                       | Expo _Credentials_ page showing FCM V1 configured | Blocked                         |
| M3  | Apple Developer: App ID `uz.moshinabor.app.pilot` with Push; APNs key via EAS                                                            | Mobile §5.1                                     | Expo _Credentials_ page showing the push key      | Blocked                         |
| M4  | iOS ad-hoc: register tester iPhones (`eas device:create`) **or** set up TestFlight (App Store Connect app + internal group)              | Mobile §5.2/§5.3                                | Device count or TestFlight group size             | Blocked                         |
| M5  | Back up the Android keystore and API keys to the password manager                                                                        | Mobile §2                                       | Confirmation                                      | Blocked                         |
| M6  | Build: `eas build --platform android --profile pilot`, `eas build --platform ios --profile pilot` (or `pilot-testflight` + `eas submit`) | Mobile §6                                       | Build URLs, version 1.0.0 + build numbers         | Blocked                         |
| M7  | Optional enhanced push security: robot token → server operator puts it in `EXPO_ACCESS_TOKEN`                                            | Mobile §3                                       | "Enabled / not enabled"                           | Blocked                         |
| M8  | Distribute the builds to the device testers                                                                                              | Mobile §6                                       | Tester list                                       | Blocked                         |

## 4. Physical-device tasks (device testers)

None of these can be done in a simulator or in this repository's automated tests.

| #   | Task                                                                                                                | Guide                                           | Hand back                                                     | Status                                                |
| --- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| D1  | Install the pilot app on ≥ 1 Android (≤ Android 11 low-end **and** Android 14+) and ≥ 1 iPhone (iOS 17 **and** 18+) | [PILOT_TEST_PLAN.md §0](PILOT_TEST_PLAN.md)     | Device and OS list                                            | Requires physical device testing                      |
| D2  | Real SMS sign-in with an invited number; an uninvited number is refused without an SMS                              | Pilot plan §1 (A1–A2), SMS §5                   | Result per device                                             | Requires physical device testing (+ P6 authorization) |
| D3  | Push registration and delivery: announcement, reminder, tap opens the app, signed-out device silent                 | [MOBILE_PUSH_SETUP.md §7](MOBILE_PUSH_SETUP.md) | Result per device + `DELIVERED` rows from the server operator | Requires physical device testing                      |
| D4  | Camera/gallery permissions, HEIC photo upload (iPhone)                                                              | Pilot plan §2 (V2–V3)                           | Result                                                        | Requires physical device testing                      |
| D5  | Offline behaviour (airplane mode), slow network                                                                     | Pilot plan §6                                   | Result                                                        | Requires physical device testing                      |
| D6  | All remaining **P1** cases of the pilot test plan                                                                   | Pilot plan                                      | Completed result table with screenshots of failures           | Requires physical device testing                      |
| D7  | Maintenance mode seen in the app (with the server operator switching it)                                            | Pilot plan §8 (P1–P2)                           | Result                                                        | Requires physical device testing                      |

## 5. Release owner — sign-off

| #   | Gate                            | Evidence required                                                                                                                  |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Staging deployed                | S1–S17 handed back; [GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md) part C complete                                                   |
| R2  | Real SMS authorized and working | P1–P6, S18–S19, D2                                                                                                                 |
| R3  | Pilot builds and push working   | M1–M8, D1, D3                                                                                                                      |
| R4  | Pilot GO                        | All P1 cases passed on physical devices (D6); no open P1 defect; on-call operator named; rollback plan read by the server operator |

## Dependency order

```
S1 → S2–S5 → S6 → S7–S9 → S10 → S11–S12 → S13–S17 ──┐
P1 → P2–P4 → P5 → S18 → S19 ─────────────────────────┼→ S20 → D2
M1 → M2/M3 → M4 → M6 → M8 ───────────────────────────┘        → D1, D3–D7 → R4
```

The server work (S) and the account applications (P1, P3, Apple enrolment in M3) should start **in parallel on day 1**, because their lead times are the longest: Eskiz template moderation, Apple/Google enrolment, branded sender approval.
