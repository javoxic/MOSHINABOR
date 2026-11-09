# Pilot test plan

This plan is for manual testing of the **MOSHINA BOR Pilot** app (`uz.moshinabor.app.pilot`) against **staging** (`https://staging.moshinabor.uz`).

> **Status (2026-11-09).** No case in this document has been executed on a real device yet. The automated suites (§6) pass. All results below are **expected** results. Fill in the Result column as you test.

Testers record each case as ✅ pass, ❌ fail (with a screenshot, the time, the phone model and the OS) or ⏭ not run. A pilot **go** requires every **P1** case to pass on at least one Android and one iOS device.

## 0. Preconditions

- Staging deployed per [STAGING_DEPLOYMENT.md](STAGING_DEPLOYMENT.md), with Eskiz and EAS push credentials configured. `/v1/health/ready` reports `sms.configured: true`.
- `access.registrationMode = allowlist` (the staging default; confirm it in **Settings → General**), and each tester's number invited in **Settings → Pilot access**.
- One number deliberately **not** invited, for P1-A2.
- Admin accounts, one per role: Super Admin, Administrator, Support, Analyst.
- Pilot builds installed (§5).
- Device matrix: at least one of each:
  - Android 10–11 (low-end, ~3 GB RAM);
  - Android 14+;
  - iPhone with iOS 17;
  - iPhone with iOS 18 or later.

  Use both Uzbek mobile networks you can reach (e.g. Beeline, Ucell, Uzmobile, Mobiuz).

## 1. Registration, SMS verification, login, logout

| ID  | Pri | Steps                                                                                       | Expected result                                                                                                           | Result |
| --- | --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------ |
| A1  | P1  | Fresh install → choose **O'zbekcha** → enter an invited number as `90 123 45 67` → Continue | An SMS arrives within ~30 s with a 6-digit code; the verify screen shows a 60 s resend countdown                          |        |
| A2  | P1  | Enter the **uninvited** number                                                              | Localized message "the pilot is invite-only"; **no SMS arrives**, and the Eskiz dashboard shows no message to that number |        |
| A3  | P1  | Enter a wrong code 5 times                                                                  | Errors 1–4 say the code is wrong; the 5th locks the code ("request a new code")                                           |        |
| A4  | P1  | Request a new code after 60 s; enter the **old** code                                       | Old code rejected; new code accepted                                                                                      |        |
| A5  | P2  | Wait more than 5 min, then enter the code                                                   | "Code expired"                                                                                                            |        |
| A6  | P2  | Tap Resend before 60 s                                                                      | Button disabled, countdown shown                                                                                          |        |
| A7  | P2  | Enter `+7 …` or a landline (`71 …`)                                                         | Validation error "enter an Uzbek mobile number"                                                                           |        |
| A8  | P1  | Correct code, first sign-in                                                                 | Profile setup screen (name) → Home with empty state                                                                       |        |
| A9  | P1  | Kill the app and reopen                                                                     | Still signed in, no SMS needed                                                                                            |        |
| A10 | P1  | Profile → Sign out → confirm                                                                | Back to the phone screen; reopening the app does **not** show the previous user's data                                    |        |
| A11 | P2  | Sign in again on a second device with the same number                                       | Works; both sessions active. In the admin, **Users → user** shows "Active sessions: 2"                                    |        |
| A12 | P2  | Admin: **Restrict** the user (or **Revoke sessions**)                                       | The app is signed out on its next request; signing in again is refused while restricted                                   |        |
| A13 | P2  | Switch the language to Русский, then English (**Settings → Language**)                      | Every screen, error and date switches; amounts stay in UZS with spaces (e.g. `350 000 so'm`)                              |        |

## 2. Vehicles

| ID  | Pri | Steps                                                                                        | Expected result                                                                                                 | Result |
| --- | --- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------ |
| V1  | P1  | Vehicles → Add: brand, model, year, plate `01 A 123 BC`, fuel = Petrol + gas, mileage 85 000 | Saved; appears in the list and becomes the primary vehicle on Home                                              |        |
| V2  | P1  | Add a photo from the camera, then one from the gallery. On iPhone, use a **HEIC** photo      | Photo shown. The HEIC photo is converted and uploaded; there is no "unsupported format" error                   |        |
| V3  | P2  | Deny camera/photo permission, then try adding a photo                                        | Explanation plus a link to system settings; no crash                                                            |        |
| V4  | P1  | Edit the mileage to a **lower** value                                                        | Refused unless "correct mileage" is ticked; with it ticked, saved                                               |        |
| V5  | P1  | Add a 2nd and a 3rd vehicle                                                                  | Each vehicle has its own schedules, history and expenses. The Home and Expenses filters switch between vehicles |        |
| V6  | P2  | Delete a vehicle (confirm)                                                                   | The vehicle, its schedules, history and expenses disappear; other vehicles are unaffected                       |        |
| V7  | P3  | Try to add a 21st vehicle                                                                    | "You can add up to 20 vehicles"                                                                                 |        |

## 3. Maintenance schedules and service completion

| ID  | Pri | Steps                                                                                  | Expected result                                                                                                                                   | Result |
| --- | --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M1  | P1  | Maintenance → Add → pick "Engine oil" (and 2–3 other service types)                    | Recommended interval is prefilled; after saving, each item shows a status (OK / Due soon / Due / Overdue / Unknown) and the next date and mileage |        |
| M2  | P1  | Add a custom schedule: "Antifreeze", every 40 000 km or 24 months                      | Saved; the next due date is computed in the Tashkent date                                                                                         |        |
| M3  | P1  | Edit an interval                                                                       | The next due date and mileage recalculate                                                                                                         |        |
| M4  | P1  | Mark the engine oil as done: today's date, mileage, cost 350 000, add as expense = yes | A history record is created; the next due date moves forward by the interval; an expense of 350 000 so'm is created in the MAINTENANCE category   |        |
| M5  | P1  | Double-tap **Save** on the completion form, including on a slow network                | Exactly **one** history record and one expense                                                                                                    |        |
| M6  | P2  | Complete with a date in the future                                                     | Refused                                                                                                                                           |        |
| M7  | P2  | History → add a past service manually; open it; delete it                              | Listed by date; details correct; deletion asks for confirmation                                                                                   |        |
| M8  | P2  | Set a vehicle's mileage so that an item crosses its threshold                          | The status changes to Due or Overdue, on Home too                                                                                                 |        |

## 4. Expenses

| ID  | Pri | Steps                                              | Expected result                                                 | Result |
| --- | --- | -------------------------------------------------- | --------------------------------------------------------------- | ------ |
| E1  | P1  | Add a fuel expense of 250 000 with a receipt photo | Listed; the receipt opens full-screen                           |        |
| E2  | P1  | Monthly total and category breakdown               | The sum equals the entries for that **Tashkent** calendar month |        |
| E3  | P2  | Edit and delete an expense                         | Totals update                                                   |        |
| E4  | P2  | Enter `1 500 000`, `1500000` and `0`               | The first two are accepted as 1 500 000; 0 is rejected          |        |

## 5. Notifications (push)

| ID  | Pri | Steps                                                                                                                             | Expected result                                                                                         | Result |
| --- | --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------ |
| N1  | P1  | First launch after sign-in                                                                                                        | The system permission prompt appears **once**                                                           |        |
| N2  | P1  | Accept. Make an item Due (M8). Wait until the next reminder run at the `reminders.sendHourLocal` hour (10:00 Tashkent by default) | One push "maintenance due" arrives; tapping it opens that schedule                                      |        |
| N3  | P1  | Admin: **Notifications → Announcement** to all users                                                                              | Push received on every pilot device; the in-app Notifications list shows it                             |        |
| N4  | P2  | Deny permission; open **Settings → Notifications**                                                                                | Shows "push disabled" with a link to the system settings; in-app notifications still listed             |        |
| N5  | P2  | Admin: notification history                                                                                                       | Shows the real delivery status from Expo/FCM/APNs receipts (SENT/DELIVERED/FAILED), not assumed success |        |
| N6  | P2  | Sign out, then send an announcement                                                                                               | The signed-out device receives **no** push                                                              |        |

## 6. Offline behaviour

| ID  | Pri | Steps                                                                                         | Expected result                                                                                    | Result |
| --- | --- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ |
| O1  | P1  | With data loaded, switch on airplane mode and browse Home, Vehicles, Maintenance and Expenses | Cached data shown with the banner "You are offline … data from <time>"                             |        |
| O2  | P1  | Offline: try to add an expense                                                                | Save is blocked with "connect to the internet to save changes". Nothing is silently queued or lost |        |
| O3  | P1  | Back online                                                                                   | The banner disappears; data refreshes automatically                                                |        |
| O4  | P2  | Kill the app while offline and reopen it                                                      | Cached data is still shown; no crash; no sign-out                                                  |        |
| O5  | P2  | Weak network (throttled to 2G)                                                                | Spinners and errors are shown, with retry possible; no duplicate saves                             |        |

## 7. Account deletion

| ID  | Pri | Steps                                                                                  | Expected result                                                                                                   | Result |
| --- | --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| D1  | P1  | Profile → Delete account → confirm                                                     | Explains the 30-day grace period; Profile shows "Account deletion scheduled for <date>"; reminders stop           |        |
| D2  | P1  | Tap **Cancel deletion** within the grace period                                        | Status back to active; all data still there; reminders resume (after the next app launch re-registers the device) |        |
| D3  | P2  | Admin: Users → the user                                                                | Status `DELETION_PENDING` with a scheduled date                                                                   |        |
| D4  | P3  | (Staging only) Set `ACCOUNT_DELETION_GRACE_DAYS=0`, redeploy and let the purge job run | User data and files are gone; the admin shows the user as deleted                                                 |        |

## 8. Pilot controls and maintenance mode

| ID  | Pri | Steps                                                                | Expected result                                                                                                                      | Result |
| --- | --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| P1  | P1  | Super Admin: switch `app.maintenanceMode` on with the message "Test" | Confirmation dialog appears. Within ~10 s, the app shows "Test" on any action. The admin shows a red bar. The audit log has an entry |        |
| P2  | P1  | Switch it off                                                        | The app works again without reinstalling                                                                                             |        |
| P3  | P1  | Remove a tester from the allowlist, then they sign out and in        | `PILOT_ACCESS_ONLY`, no SMS sent                                                                                                     |        |
| P4  | P2  | Admin panel from a non-allow-listed network                          | HTTP 403                                                                                                                             |        |
| P5  | P2  | Open `https://staging.moshinabor.uz/docs` and `/v1/admin/auth/me`    | 404                                                                                                                                  |        |

## 9. Admin permissions

Log in as each role. Expected access per role:

| Area                                                                | Super Admin  | Administrator | Support      | Analyst                                  |
| ------------------------------------------------------------------- | ------------ | ------------- | ------------ | ---------------------------------------- |
| Dashboard                                                           | ✔            | ✔             | ✔            | ✔                                        |
| Users list                                                          | ✔ full phone | ✔ full phone  | ✔ full phone | ✔ **masked** phone (`+998 90 *** ** 67`) |
| Restrict user / revoke sessions / pilot invites                     | ✔            | ✔             | ✔            | ✘ (buttons hidden; API 403)              |
| Vehicles                                                            | ✔            | ✔             | ✔            | ✔                                        |
| Maintenance categories: edit                                        | ✔            | ✔             | ✘            | ✘                                        |
| Announcements / templates                                           | ✔            | ✔             | ✘            | ✘                                        |
| Administrators: view / manage                                       | ✔ / ✔        | ✔ / ✘         | ✘            | ✘                                        |
| Audit log                                                           | ✔            | ✔             | ✘            | ✘                                        |
| Settings: view / change (incl. maintenance mode, registration mode) | ✔ / ✔        | ✔ / ✘         | ✘            | ✘                                        |

Additional checks:

| ID  | Pri | Steps                                                                               | Expected result                                                     | Result |
| --- | --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------ |
| R1  | P1  | For each role, try the hidden pages by typing their URL                             | "No permission" page; the API returns 403                           |        |
| R2  | P1  | 5 wrong passwords                                                                   | Account locked for a period; generic error message                  |        |
| R3  | P2  | An Administrator tries to grant a permission they lack, or to change their own role | Refused                                                             |        |
| R4  | P2  | Every change above                                                                  | Appears in the audit log with the admin, time and IP; phones masked |        |

## 10. Builds (TASK 5)

Pilot builds use the separate app identity, so they can sit next to a later production install:

|                              | Pilot                                                                                         | Production                  |
| ---------------------------- | --------------------------------------------------------------------------------------------- | --------------------------- |
| Name                         | MOSHINA BOR Pilot                                                                             | MOSHINA BOR                 |
| iOS bundle / Android package | `uz.moshinabor.app.pilot`                                                                     | `uz.moshinabor.app`         |
| API                          | `https://staging.moshinabor.uz`                                                               | `https://api.moshinabor.uz` |
| EAS profile                  | `pilot` (internal: APK + ad-hoc iOS) or `pilot-testflight` (Play internal track + TestFlight) | `production`                |

One-time setup:

```sh
cd mobile
npm i -g eas-cli                         # ≥ 16
eas login
eas init                                 # creates the EAS project; app.config.ts is dynamic, so note the printed project ID
export EAS_PROJECT_ID=<project-id>       # app.config.ts reads extra.eas.projectId from this variable; set it locally
eas env:create --name EAS_PROJECT_ID --value <project-id> --environment preview --visibility plaintext   # …and for cloud builds (pilot profiles use EAS environment "preview")
eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment preview --visibility sensitive
#   google-services.json must come from a Firebase Android app registered for package uz.moshinabor.app.pilot
eas credentials                          # Android keystore (generated by EAS); iOS: distribution cert + provisioning profile
#   Android push: upload the FCM V1 service-account JSON for package uz.moshinabor.app.pilot
#   iOS push:     let EAS create the APNs key for bundle uz.moshinabor.app.pilot
eas device:create                        # register each iPhone UDID for ad-hoc (internal) builds
```

Build and distribute:

```sh
eas build --platform android --profile pilot        # APK; share the install link from the EAS dashboard
eas build --platform ios --profile pilot            # ad-hoc; installs only on registered UDIDs
# or, through the stores' beta channels:
eas build --platform all --profile pilot-testflight
eas submit --platform ios --profile pilot-testflight      # → TestFlight
eas submit --platform android --profile pilot-testflight  # → Play Console internal testing
```

Without `EAS_PROJECT_ID` the app builds, but push registration reports "unavailable" (by design, no fake token). Builds without it are not acceptable for the pilot.

Local check, which needs no accounts: `pnpm --filter mobile export:pilot`. It bundles the pilot variant for Android and iOS into `mobile/dist-pilot`.

**Build status:**

- `expo export` of both the production and the pilot variant **passes** (§11).
- **No EAS build has been run.** That needs an Expo account, Apple Developer credentials and Firebase, none of which are available here.
- **No real-device testing has been done.**

## 11. Automated verification (2026-11-09, release/staging-pilot)

| Suite                                                        | Result                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| `packages/shared` unit tests                                 | 59 passed                                                |
| `packages/validation` unit tests                             | 8 passed                                                 |
| Backend e2e + unit tests (Jest, real PostgreSQL + Redis)     | 127 passed, 15 suites (incl. `pilot-safety.e2e-spec.ts`) |
| Mobile unit tests                                            | 31 passed                                                |
| Admin unit tests (Vitest)                                    | 8 passed                                                 |
| Admin end-to-end tests (Playwright, real API)                | 10 passed                                                |
| Typecheck, ESLint and Prettier, all workspaces               | clean                                                    |
| Backend build, admin build, `prisma migrate diff` (no drift) | pass                                                     |
| `expo export` production + pilot, Android + iOS              | pass                                                     |

The final numbers are recorded in [RELEASE_NOTES.md](RELEASE_NOTES.md).
