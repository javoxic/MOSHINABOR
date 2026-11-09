# Mobile build and push setup — Expo/EAS, Firebase (Android), Apple (iOS, TestFlight)

**Audience:** the mobile release administrator.
**Result:** installable **MOSHINA BOR Pilot** builds for Android and iOS that talk to `https://staging.moshinabor.uz` and receive push notifications.

> **Status:** **Blocked by external credentials.** No Expo, Firebase or Apple account is configured, and no EAS build has been run. `eas.json` validates with `@expo/eas-json` 16.30.0 and 27.5.0, and every `eas` command and flag below exists in `eas-cli` 16.32.0 and 27.5.0 (checked with `--help`; see [Validation](#validation)). Push delivery **requires physical device testing**: simulators and emulators without Google Play services cannot receive push. Dashboard menu names are given as of late 2026 and may move; the URLs are stable.

## 1. Identifiers (use exactly these)

| Item                         | Pilot (this guide)                                                                                                        | Production (later)          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| App name                     | MOSHINA BOR Pilot                                                                                                         | MOSHINA BOR                 |
| iOS bundle ID                | `uz.moshinabor.app.pilot`                                                                                                 | `uz.moshinabor.app`         |
| Android package              | `uz.moshinabor.app.pilot`                                                                                                 | `uz.moshinabor.app`         |
| URL scheme                   | `moshinabor-pilot`                                                                                                        | `moshinabor`                |
| API                          | `https://staging.moshinabor.uz`                                                                                           | `https://api.moshinabor.uz` |
| EAS build profiles           | `pilot` (internal: APK + ad-hoc iOS), `pilot-testflight` (Play internal track + TestFlight)                               | `production`                |
| EAS environment (variables)  | `preview`                                                                                                                 | `production`                |
| Android notification channel | `reminders` (created by the app)                                                                                          | same                        |
| Version                      | `1.0.0` (`mobile/app.config.ts`); build numbers are managed remotely by EAS (`appVersionSource: remote`, `autoIncrement`) |                             |

The pilot identity comes from `APP_VARIANT=pilot`, which `eas.json` sets for both pilot profiles. Never build the pilot with the `production` profile, or the reverse.

## 2. Accounts needed

| Account                                                                                         | Who owns it                  | Cost / lead time                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Expo account (create an **organization**, e.g. `moshinabor`, and add release admins as members) | Mobile release administrator | Free tier is enough for a pilot; builds queue longer on the free tier                                                                  |
| Google account with access to Firebase                                                          | Mobile release administrator | Free                                                                                                                                   |
| Google Play Console developer account                                                           | Company                      | One-time fee; identity verification can take days. Only needed for `pilot-testflight` on Android; the internal APK does not need Play. |
| Apple Developer Program (organization membership, D-U-N-S number)                               | Company                      | Annual fee; enrolment can take days to weeks                                                                                           |
| App Store Connect access (App Manager role) for the release admin                               | Company                      | —                                                                                                                                      |

**Secure storage of credentials.** Use the team password manager for:

- the Expo login with 2FA;
- the Apple ID with 2FA;
- App Store Connect API key (`.p8`) metadata;
- the Google service-account JSON files.

EAS stores the signing keystore, the iOS distribution certificate, provisioning profiles and the APNs key on Expo's servers when you let EAS manage them (recommended). Download a backup of the Android keystore (`eas credentials` → Android → Keystore → Download) into the password manager. Losing it means a new package name. **Never commit** `google-services.json`, `.p8`, `.p12`, `.jks`, `.keystore` or service-account JSON files; `.gitignore` and the reviewers must keep them out.

## 3. Expo / EAS project

On the release administrator's machine (Node 22, repository checked out at the release commit):

```sh
npm install -g eas-cli@latest          # validated with 16.32.0 and 27.5.0; eas.json requires >= 16.0.0
eas login                              # Expo account (2FA)
eas whoami
cd mobile
eas init                               # create or link the project "moshina-bor" under the organization
```

`app.config.ts` is dynamic, so `eas init` **cannot** write the project ID into it. Copy the ID it prints, or take it from expo.dev → the project → _Project settings_ → _ID_, and provide it in two places:

```sh
export EAS_PROJECT_ID=<EAS_PROJECT_ID>                      # local shell: eas-cli reads app.config.ts here
eas env:create --name EAS_PROJECT_ID --value <EAS_PROJECT_ID> --environment preview --environment production \
  --visibility plaintext --non-interactive                  # cloud builds
eas env:list --environment preview                          # shows EAS_PROJECT_ID
```

The project ID is not a secret: it identifies the project and is part of every push token request.

**Enhanced push security** (optional): on expo.dev → the account → _Settings_ → _Access tokens_, enable "Enhanced security for push notifications" and create a robot token. Put the token in `EXPO_ACCESS_TOKEN` in the server's `.env.staging` (never in the app or git), then redeploy. Without enhanced security, leave `EXPO_ACCESS_TOKEN` empty.

## 4. Firebase — Android push (FCM HTTP v1)

1. <https://console.firebase.google.com> → _Add project_ → name `moshinabor-staging` (Analytics not needed).
2. _Project overview_ → _Add app_ → Android:
   - package name **`uz.moshinabor.app.pilot`**, nickname "MOSHINA BOR Pilot";
   - skip the SDK steps;
   - **Download `google-services.json`**.
3. _Project settings_ (gear) → _Cloud Messaging_: check that "Firebase Cloud Messaging API (V1)" is **Enabled**.
4. _Project settings_ → _Service accounts_ → _Generate new private key_. This downloads a JSON key with FCM send rights. Treat it as a secret.
5. Give EAS both files. Do this from a private directory **outside the repository**, then delete the local copies once they are in the password manager:

   ```sh
   cd mobile
   eas env:create --name GOOGLE_SERVICES_JSON --type file --value <PATH_TO>/google-services.json \
     --environment preview --visibility sensitive --non-interactive
   eas credentials --platform android
   #   → build profile: pilot
   #   → Google Service Account → Manage your Google Service Account Key for Push Notifications (FCM V1)
   #   → Set up a Google Service Account Key for Push Notifications (FCM V1) → select <PATH_TO>/<service-account>.json
   ```

   `app.config.ts` reads `GOOGLE_SERVICES_JSON` as `android.googleServicesFile`. Without it, Android builds succeed, but push registration fails on the device and is reported as a warning, never as success.

6. Check: expo.dev → project → _Credentials_ → Android → `uz.moshinabor.app.pilot` shows "FCM V1 service account key: configured".

## 5. Apple — iOS push, ad-hoc devices and TestFlight

### 5.1 Apple Developer portal

EAS can do most of this automatically when you sign in with the Apple ID during `eas build` / `eas credentials`. To do it by hand:

1. <https://developer.apple.com/account> → _Certificates, Identifiers & Profiles_ → _Identifiers_ → **+** → _App IDs_ → _App_:
   - Bundle ID **Explicit** `uz.moshinabor.app.pilot`;
   - capability **Push Notifications**.
2. _Keys_ → **+** → enable **Apple Push Notifications service (APNs)** → download the `.p8` **once**, and record the Key ID and Team ID in the password manager. If you let EAS create the key, skip this.
3. Upload or let EAS manage it: `eas credentials --platform ios` → build profile `pilot` → _Push Notifications: Manage your Apple Push Notifications Key_ → _Set up_ (EAS generates one) or _Use existing_ (`.p8`).

### 5.2 Ad-hoc internal distribution (`pilot` profile): fastest, up to 100 devices per type per year

```sh
cd mobile
eas device:create            # prints a URL / QR: each tester opens it on their iPhone and installs the profile
                             # → the iPhone's UDID is registered in your Apple account
eas device:list              # confirm every tester device is listed
```

Each new device requires a **new** iOS build, so the provisioning profile includes it. Testers must enable _Settings → Privacy & Security → Developer Mode_ on iOS 16+ to open ad-hoc builds.

### 5.3 TestFlight (`pilot-testflight` profile)

1. <https://appstoreconnect.apple.com> → _Apps_ → **+** → _New App_:
   - platform iOS, name "MOSHINA BOR Pilot";
   - bundle ID `uz.moshinabor.app.pilot`;
   - SKU `moshinabor-pilot`.
2. _Users and Access_ → _Integrations_ → _App Store Connect API_ → generate a key with the **App Manager** role. Store the `.p8`, Key ID and Issuer ID in the password manager. `eas submit` asks for them, or you can let it use your Apple ID.
3. After the first upload: _TestFlight_ → _Internal Testing_ → create the group "Pilot" and add testers (up to 100 App Store Connect users, no review). External testers need _Beta App Review_ (about 1 day).
4. Export compliance is pre-answered: `ITSAppUsesNonExemptEncryption = false` is in `app.config.ts`.

## 6. Build the pilot apps

Run from `mobile/`, with `EAS_PROJECT_ID` exported (§3):

```sh
# Internal distribution (recommended for the first pilot wave)
eas build --platform android --profile pilot          # → APK; EAS prints an install URL / QR code
eas build --platform ios --profile pilot              # → ad-hoc IPA for the devices registered in §5.2

# Store beta channels (optional)
eas build --platform all --profile pilot-testflight
eas submit --platform ios --profile pilot-testflight --latest       # → TestFlight
eas submit --platform android --profile pilot-testflight --latest   # → Play Console, internal testing track
```

Notes:

- **Google Play:** the very first AAB for a new app must be uploaded **manually** in Play Console (_Test and release_ → _Testing_ → _Internal testing_ → _Create new release_). After that, `eas submit` works with a Google service account that has _Release manager_ rights for the app. Create it in Play Console → _Users and permissions_, and store its JSON in the password manager.
- **Checking a build:** the expo.dev build page shows the profile (`pilot`), the environment (`preview`), the variables used, and the version and build number. The app shows the STAGING data, and the admin panel shows the device under the user's _Push devices_.
- **Android APK install:** testers open the EAS link on the phone and allow "Install unknown apps" for the browser once.
- **Local bundle check without accounts:** `pnpm --filter mobile export:pilot` (passes in CI and in the sandbox).

## 7. Verify push registration and delivery (physical devices)

Prerequisites:

- staging is deployed;
- the tester's number is invited;
- the tester signed in with the pilot build on a **physical** device.

| #   | Step                                                                                                                               | Expected                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | First launch after sign-in                                                                                                         | The OS permission prompt appears once; allow it                                                                                                    |
| 2   | Admin → Users → the tester → _Push devices_                                                                                        | One active device per phone, with the right platform (ANDROID / IOS)                                                                               |
| 3   | Server: registration in the database (below)                                                                                       | `disabled = f`, `last_seen_at` recent, `app_version` = 1.0.0                                                                                       |
| 4   | Admin → Notifications → _Announcements_ → _New announcement_, short title and body (optionally limited to one language) → send now | Within about 1 minute (the worker dispatches due announcements every minute), the push appears on each device and in the in-app Notifications list |
| 5   | Database: delivery rows (below)                                                                                                    | `delivery = SENT` right away (Expo accepted the ticket)                                                                                            |
| 6   | Wait 15–25 min. The worker fetches Expo receipts every 10 min, for tickets older than 15 min.                                      | `delivery = DELIVERED` (Expo handed the message to FCM/APNs), or `FAILED` with the reason                                                          |
| 7   | Tap the notification (for a maintenance reminder)                                                                                  | The app opens the schedule                                                                                                                         |
| 8   | Sign out on one device, then send another announcement                                                                             | That device receives nothing; its row shows `disabled = t`                                                                                         |
| 9   | Reminder path: make a schedule overdue, then Admin → Notifications → _Scheduled_ → **Run reminder engine now**                     | A "maintenance overdue" push arrives                                                                                                               |

Server queries. No tokens are shown.

```sh
$ cd /srv/moshinabor/infrastructure/deployment && . ./.env.staging
$ dcq() { docker compose --env-file .env.staging -p moshina-bor-staging exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"; }
$ dcq "SELECT platform, device_name, app_version, last_seen_at, disabled_at IS NOT NULL AS disabled FROM push_devices ORDER BY last_seen_at DESC LIMIT 10;"
$ dcq "SELECT n.created_at, n.type, n.push_status, d.status AS delivery, d.sent_at, d.receipt_checked_at, left(d.error, 80) AS error FROM notifications n LEFT JOIN notification_deliveries d ON d.notification_id = n.id ORDER BY n.created_at DESC LIMIT 10;"
```

Common failures. Each one is recorded and none is reported as success:

| Symptom                                                                 | Cause                                                                  | Fix                                             |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| No device in _Push devices_; app log "EAS project id is not configured" | Build made without `EAS_PROJECT_ID`                                    | §3, rebuild                                     |
| Android: no device; "Default FirebaseApp is not initialized"            | `GOOGLE_SERVICES_JSON` missing in the `preview` environment            | §4 step 5, rebuild                              |
| `FAILED` with `InvalidCredentials`                                      | FCM V1 key or APNs key not configured in EAS for this bundle/package   | §4 step 5 / §5.1 step 3; no rebuild needed      |
| `FAILED` with `DeviceNotRegistered`                                     | App uninstalled or token rotated; the device is disabled automatically | Reopen the app to re-register                   |
| `push_status = SKIPPED`                                                 | User disabled push in the app's settings, or the account is not ACTIVE | Expected                                        |
| iOS: nothing arrives for ad-hoc builds                                  | APNs key or entitlement missing, or a device not in the profile        | `eas credentials`, `eas device:create`, rebuild |

## Validation

| Item                                                                                                                                                                                  | Result (2026-11-09)                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `eas.json` parsed by `@expo/eas-json` 16.30.0 and 27.5.0                                                                                                                              | all profiles resolve; pilot → `uz.moshinabor.app.pilot`, staging URL, environment `preview`, `autoIncrement`                    |
| Flags used above (`env:create --name/--value/--type/--environment/--visibility/--non-interactive`, `build -p/-e`, `submit -p/-e/--latest`, `device:create`, `init`, `credentials -p`) | present in `eas-cli` 16.32.0 and 27.5.0 `--help`                                                                                |
| App identity for both variants (`expo config --type public`)                                                                                                                          | production `uz.moshinabor.app` → `https://api.moshinabor.uz`; pilot `uz.moshinabor.app.pilot` → `https://staging.moshinabor.uz` |
| `expo export` (production and pilot, Android + iOS)                                                                                                                                   | passes                                                                                                                          |
| Server-side push logic (tickets, receipts, `DeviceNotRegistered` handling, skip rules)                                                                                                | backend tests pass (`notifications.e2e-spec.ts`, reminders cadence)                                                             |
| Push SQL queries                                                                                                                                                                      | executed against the sandbox staging database                                                                                   |
| Real EAS builds, Firebase/APNs credentials, push on devices                                                                                                                           | **not verified**: blocked by external credentials, then requires physical device testing                                        |
