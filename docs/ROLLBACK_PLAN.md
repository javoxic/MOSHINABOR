# Rollback plan

This plan applies to both staging and production. The scripts take the env file as their first argument (`.env.staging` or `.env`) and derive the compose project and history file from `DEPLOYMENT_ENVIRONMENT`. All commands run from `infrastructure/deployment/`.

## 1. First response: maintenance mode (seconds)

When users are being harmed, for example by wrong reminders, data corruption or an auth problem, **stop the bleeding first**:

1. In the admin panel, open **Settings → General**, set `app.maintenanceMode` to **On** and confirm. Optionally set `app.maintenanceMessage`, e.g. "Texnik ishlar olib borilmoqda, 30 daqiqadan so'ng qayting".
2. Within about 10 s, every mobile API call answers `503 MAINTENANCE_MODE`, and the app shows the message. The admin panel, health checks and SMS webhooks keep working, so you can investigate.
3. The change is recorded in the audit log.

If the admin panel itself is broken, set the value directly in the database:

```sh
docker compose --env-file .env.staging -p moshina-bor-staging exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "INSERT INTO system_settings(key, value, updated_at) VALUES ('app.maintenanceMode', 'true'::jsonb, now()) ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb, updated_at = now();"
```

Maintenance mode does **not** stop the worker. If the problem is in reminders or push, also stop the worker with `docker compose … stop worker`.

## 2. Decision tree

```
Is the new release at fault?
├─ No (external: Eskiz down, Expo down, host problem) → keep maintenance on if needed; fix the dependency.
└─ Yes
   ├─ Did the release only add code / additive migrations, and is data intact?
   │     → CODE-ONLY ROLLBACK (§3a). No data loss.
   └─ Did the release write wrong data, or run a destructive migration?
         → ROLLBACK WITH DATABASE RESTORE (§3b), using the pre-deployment backup.
           Everything written after that backup is lost — decide consciously and record it.
```

## 3. Roll back

`.deploy-history-<env>` lists every deployed version, oldest first:

```sh
cat .deploy-history-staging        # e.g. "2026-11-09T14:07:13Z 0cddc14" (rollbacks end in "rollback")
```

`rollback.sh` refuses to run unless `moshina-bor/api:<version>` and `moshina-bor/admin:<version>` exist locally. Keep at least the last three versions' images on the host (`docker image ls moshina-bor/*`), or pull them from your registry first.

### 3a. Code-only rollback

```sh
./rollback.sh .env.staging 0cddc14
```

This restarts `api`, `worker` and `admin` on the old images, waits for `/v1/health/ready` and appends a `rollback` line to the history. Postgres, Redis and the uploads are untouched.

**Why this is safe — migration policy.** Every migration must be **forward-only and backward-compatible**:

- add tables or columns (nullable or with defaults) and indexes;
- never drop or rename in the same release that stops using them;
- remove old structures only in a later release, after the previous version is no longer a rollback target.

Under this policy, the previous code runs correctly against the newer schema. For example, the pilot migration `20261109135740_pilot_access_allowlist` only adds the `access_allowlist` table, which older code ignores. Prisma does not run down-migrations, and none are needed.

### 3b. Rollback with database restore

Before every upgrade, `deploy.sh` runs a one-off backup that writes `backups-<env>/db-YYYYmmdd-HHMMSS.dump.gpg` and `storage-YYYYmmdd-HHMMSS.tar.gz.gpg`. The timestamps are in Asia/Tashkent time. Pick the pair whose timestamp is just before the faulty deployment's line in `.deploy-history-<env>`, which is in UTC:

```sh
ls -lt backups-staging/                      # newest first
./rollback.sh .env.staging 0cddc14 --restore-db \
  backups-staging/db-20261109-190821.dump.gpg \
  backups-staging/storage-20261109-190821.tar.gz.gpg
```

The script performs these steps:

1. Stops `api` and `worker`.
2. Decrypts the dump with the env's passphrase into a private temp dir, removed afterwards.
3. Restores the dump with `pg_restore --clean --if-exists`, and the files if given.
4. Starts the old version and waits for readiness.

## 4. Restore a backup

Use this without a version change, for example after accidental data loss:

```sh
docker compose --env-file .env.staging -p moshina-bor-staging stop api worker
ENV_FILE=.env.staging ./restore.sh backups-staging/db-YYYYmmdd-HHMMSS.dump.gpg [backups-staging/storage-YYYYmmdd-HHMMSS.tar.gz.gpg]
docker compose --env-file .env.staging -p moshina-bor-staging up -d api worker
```

Restore drills:

- Restore into a scratch project at least monthly, e.g. `DEPLOYMENT_ENVIRONMENT=drill` in a copy of the env file. This proves both the backups and the passphrase.
- **Never** restore a production dump into staging. Staging must not hold production user data.

## 5. After the rollback

1. Check health: `./monitor.sh .env.staging` must print OK. Smoke-test sign-in and one vehicle screen on a pilot device.
2. Switch maintenance mode **off** in the admin panel. `monitor.sh` keeps reminding you while it is on.
3. Write down what happened: version, time, whether data was restored, and the data-loss window. The audit log already records the setting changes.
4. Fix forward on a branch, and redeploy with `deploy.sh` once the fix passes the full test suite.

## 6. Mobile app rollback

Native builds cannot be pulled back from devices:

- **Pilot (internal distribution / TestFlight):** expire the build in TestFlight or App Store Connect, or delete the APK link, and share the previous build. Tell testers to reinstall.
- **Server-side protection:** the app keeps working against an older or newer API because API changes are additive. If a client build is harmful, maintenance mode stops it from reaching data while a replacement is distributed.
- **OTA updates (EAS Update):** not configured. The channels `pilot` and `production` are set in `eas.json`, so it can be enabled later, but no update has been published.

## 7. Drill results (sandbox, 2026-11-09)

| Step                                                                             | Result                                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Deploy `0cddc14` to `moshina-bor-staging`, create data (admin, settings changes) | ready                                                                                 |
| Deploy `0cddc14-r2`                                                              | encrypted pre-deployment backup written (`.gpg`, mode 0600); ready                    |
| Change data after the upgrade                                                    | —                                                                                     |
| `rollback.sh .env.staging 0cddc14 --restore-db <predeploy dump>`                 | ready on `0cddc14`; post-upgrade changes gone, pre-upgrade data present (as designed) |
| History file                                                                     | `0cddc14`, `0cddc14-r2`, `0cddc14 rollback` entries recorded                          |

Not drilled: a production rollback, and a rollback on a real public host.
