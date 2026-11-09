# Backup and monitoring setup — off-server backups, restore proof, uptime, alerts

**Audience:** the server operator.
**Result:**

- encrypted backups leave the server automatically;
- a restore is proven every week;
- outages are noticed from outside the server;
- every alert reaches a human.

> **Status:** the on-server parts are **Verified** in the sandbox staging stack (2026-11-09): encrypted backups, `verify-backup.sh`, `monitor.sh`, webhook delivery and cron syntax. The off-server copy was **verified against a local S3-compatible emulator** (moto 5.1.4) with the server's rclone version (1.60.1): versioning, lifecycle rule, upload, idempotent re-run, download and restore. The real bucket, real alert channel and real uptime service are **Blocked by external credentials**. Placeholders look like `<LIKE_THIS>`; never write real keys or URLs into documents.

## 1. What exists already (no setup needed)

| Mechanism             | Where                                         | Behaviour                                                                                                                                                                                                                                |
| --------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daily backup          | `backup` container (`backup.sh`)              | `pg_dump` + uploads archive every `BACKUP_INTERVAL_SECONDS` (86400), **GnuPG AES-256** with `secrets/staging_backup_passphrase`, files mode 600 in `backups-staging/`. It refuses to write plaintext (`BACKUP_REQUIRE_ENCRYPTION=true`). |
| Pre-deployment backup | `deploy.sh`                                   | Same, immediately before every upgrade. The deployment aborts if the backup fails.                                                                                                                                                       |
| On-host retention     | `BACKUP_RETENTION_DAYS` (staging template: 7) | Older `db-*`/`storage-*` files are deleted by the backup container                                                                                                                                                                       |
| Health monitor        | `monitor.sh` (cron)                           | Containers, readiness, public HTTPS and certificate, error bursts, backup age (< 26 h), disk usage (< 85 %), maintenance reminder → `ALERT_WEBHOOK_URL`                                                                                  |
| Restore proof         | `verify-backup.sh`                            | Decrypts and restores a backup in a **network-less throw-away** PostgreSQL container, prints row counts, removes it, and alerts the webhook on failure. The live database is never touched.                                              |

## 2. Encrypted off-server backups

### 2.1 Bucket (operator, at the storage provider)

Use any S3-compatible object storage: Backblaze B2, Wasabi, Cloudflare R2, AWS S3, or an Uzbek provider with an S3 API. Keep it in a different provider or region than the VPS.

1. Create the bucket `<BUCKET_NAME>` (e.g. `moshinabor-staging-backups`): **private**, **versioning enabled**.
2. Add the lifecycle rule below. In AWS-compatible consoles it is under _Management → Lifecycle rules_; on B2, use _Lifecycle Settings_ → "Keep prior versions for 7 days" plus a 35-day hide/delete rule.

   ```json
   {
     "Rules": [
       {
         "ID": "moshinabor-staging-retention",
         "Status": "Enabled",
         "Filter": { "Prefix": "" },
         "Expiration": { "Days": 35 },
         "NoncurrentVersionExpiration": { "NoncurrentDays": 7 },
         "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
       }
     ]
   }
   ```

   With the AWS CLI: `aws s3api put-bucket-lifecycle-configuration --bucket <BUCKET_NAME> --lifecycle-configuration file://lifecycle.json --endpoint-url <S3_ENDPOINT>`.

3. Optional, recommended for production: **object lock** (compliance mode, 35 days). This stops anyone holding the server's key from deleting backups.
4. Create **two** access keys:

   | Key                  | Permissions                                                       | Stored                                                  |
   | -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
   | Upload key (server)  | this bucket only: **list + put**; **no delete**, no other buckets | server: `~deploy/.config/rclone/rclone.conf` (mode 600) |
   | Restore key (humans) | this bucket only: **list + get**                                  | password manager only, never on the server              |

### 2.2 rclone on the server (as `deploy`)

```sh
$ rclone config
#   n) New remote → name: staging-backups → Storage: s3 → provider: <your provider, or "Other">
#   access_key_id / secret_access_key: the UPLOAD key (typed here, never on a command line)
#   region / endpoint: <S3_REGION> / <S3_ENDPOINT> → leave the rest at defaults → y) Yes → q) Quit
$ chmod 600 ~/.config/rclone/rclone.conf
$ cd /srv/moshinabor/infrastructure/deployment
$ rclone copy backups-staging staging-backups:<BUCKET_NAME>/staging --include '*.gpg' --immutable --s3-no-check-bucket -v
$ rclone lsf staging-backups:<BUCKET_NAME>/staging | tail -4         # db-…dump.gpg / storage-…tar.gz.gpg
```

| Flag                   | Why                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `--include '*.gpg'`    | Only encrypted files ever leave the server. A stray plaintext file is never uploaded (verified).    |
| `--immutable`          | Never overwrite an existing remote file. A changed file is reported as an error instead (verified). |
| `--s3-no-check-bucket` | The upload key does not need bucket-create rights                                                   |

### 2.3 Schedule

See §5 for the complete crontab: copy every 6 hours, so a new daily backup leaves the server within 6 hours of creation.

### 2.4 Backup passphrase

- `secrets/staging_backup_passphrase` is the only key to every backup. Keep it in the password manager entry "MOSHINA BOR staging — backup passphrase", **not** in the bucket.
- **Rotation:**
  1. Write a new passphrase file and redeploy.
  2. Keep the old passphrase entry until the last backup encrypted with it has expired (35 days off-server).
  3. Label both entries with their date range.

## 3. Retention policy (staging)

| Copy                                 | Frequency                                        | Kept          | Purpose                                    |
| ------------------------------------ | ------------------------------------------------ | ------------- | ------------------------------------------ |
| On-server `backups-staging/`         | daily + before every deployment                  | 7 days        | fast rollback (`rollback.sh --restore-db`) |
| Off-server bucket (current versions) | copied every 6 h                                 | 35 days       | server loss, ransomware, operator error    |
| Off-server previous versions         | — (files are never overwritten)                  | 7 days        | safety net for the lifecycle rule          |
| Restore proof                        | weekly automatic; monthly manual from the bucket | logs: 90 days | proves backups and passphrase work         |

- **Recovery point:** at most 24 h of data loss (daily backups), or 0 for deployments (pre-deployment backup).
- **Recovery time:** about 1 h on a new server: runbook §1–5, then `restore.sh`.
- Staging holds **test data only**. For production, extend this to daily backups for 35 days plus monthly backups for 12 months, and add WAL archiving if a 24 h RPO is too long.

## 4. Restore verification

**Weekly, automatic.** Runs from the cron in §5; it alerts on failure:

```sh
$ ./verify-backup.sh .env.staging
==> Verifying db-YYYYmmdd-HHMMSS.dump.gpg in an isolated container
    migrations applied: 2
    latest migration: 20261109135740_pilot_access_allowlist
    users: <n>
    …
ok:   database dump decrypted and restored
ok:   files archive storage-YYYYmmdd-HHMMSS.tar.gz.gpg decrypted and readable (<n> entries)
BACKUP VERIFIED: db-YYYYmmdd-HHMMSS.dump.gpg
```

**Monthly, manual: the real disaster test.** Download from the bucket with the **restore key** on an operator machine or the server, then verify:

```sh
$ export RESTORE_DIR="$(mktemp -d)"
$ rclone lsf staging-restore:<BUCKET_NAME>/staging --include 'db-*.dump.gpg' | sort | tail -1       # newest, e.g. db-20261201-030000.dump.gpg
$ rclone copy staging-restore:<BUCKET_NAME>/staging "$RESTORE_DIR" --include '*-20261201-030000.*'
$ ./verify-backup.sh .env.staging "$RESTORE_DIR/db-20261201-030000.dump.gpg" "$RESTORE_DIR/storage-20261201-030000.tar.gz.gpg"
$ rm -rf "$RESTORE_DIR"
```

`staging-restore` is a second rclone remote configured with the read-only restore key. Remove it again afterwards if you created it on the server.

Record the date, file and result in the ops log. A **wrong passphrase** or a corrupted file makes `verify-backup.sh` exit 1 and send a "backup verification FAILED" alert (verified).

**Full restore into the live stack.** Only for a real recovery: [ROLLBACK_PLAN.md §3b/§4](ROLLBACK_PLAN.md).

## 5. Crontab (as `deploy`, `crontab -e`)

```cron
MAILTO=""
D=/srv/moshinabor/infrastructure/deployment
# Health, errors, backups, disk, certificate — every 5 minutes; heartbeat only when everything is OK.
*/5 * * * * cd $D && ./monitor.sh .env.staging >> monitor.log 2>&1 && curl -fsS -m 10 -o /dev/null "<HEARTBEAT_URL>"
# Off-server copy of the encrypted backups.
30 */6 * * * cd $D && rclone copy backups-staging staging-backups:<BUCKET_NAME>/staging --include '*.gpg' --immutable --s3-no-check-bucket >> offsite.log 2>&1
# Weekly restore proof of the newest backup (Monday 04:15 Tashkent); alerts on failure.
15 4 * * 1 cd $D && ./verify-backup.sh .env.staging >> verify-backup.log 2>&1
```

The heartbeat URL is a secret-ish token. If you prefer it out of the crontab, put it in a mode 600 file and use `curl -K <file>`.

Rotate the three log files with logrotate:

```sh
$ sudo tee /etc/logrotate.d/moshinabor >/dev/null <<'EOF'
/srv/moshinabor/infrastructure/deployment/*.log {
  weekly
  rotate 12
  compress
  missingok
  notifempty
  copytruncate
}
EOF
```

## 6. Uptime monitoring (outside the server)

`monitor.sh` cannot report a dead server or a dead cron. Use an external service, e.g. UptimeRobot, Better Stack or Healthchecks.io. In each, add a monitor with _New monitor_ → _HTTP(s)_.

| Monitor               | Type                                               | Target                                          | Interval | Alert when                                                                                      |
| --------------------- | -------------------------------------------------- | ----------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| API liveness          | HTTP(s)                                            | `https://staging.moshinabor.uz/v1/health/live`  | 1–5 min  | not 200 for 2 checks                                                                            |
| API readiness         | HTTP(s), keyword `"ok":true`                       | `https://staging.moshinabor.uz/v1/health/ready` | 5 min    | missing keyword                                                                                 |
| Certificate           | SSL expiry (or the HTTP monitor's SSL option)      | `staging.moshinabor.uz`                         | daily    | < 14 days                                                                                       |
| Server-side heartbeat | Cron / heartbeat check, period 5 min, grace 10 min | `<HEARTBEAT_URL>` pinged by the crontab         | —        | no ping for 15 min. This covers: server down, cron broken, **or `monitor.sh` found a problem**. |

- Do **not** monitor `admin-staging.moshinabor.uz`: it answers 403 to everyone outside the operator IPs, by design.
- Route all monitors to the same channel as §7, plus e-mail or SMS to the on-call operator.

## 7. Alert webhook

1. Create the destination:
   - **Slack:** _Apps_ → _Incoming Webhooks_ → _Add to Slack_ → choose the channel `#moshinabor-alerts`.
   - **Mattermost:** _Integrations_ → _Incoming Webhooks_.
   - **Telegram:** run a small relay that accepts `{"text": "..."}`.
2. Put the URL into `.env.staging` as `ALERT_WEBHOOK_URL`. It must be https; `check-config.sh` refuses to deploy without it.
3. **Verify delivery** (the URL is read from the env file and passed on stdin, not on the command line):

   ```sh
   $ cd /srv/moshinabor/infrastructure/deployment
   $ ( . ./.env.staging
       printf 'url = "%s"\n' "$ALERT_WEBHOOK_URL" | curl -fsS -m 10 -K - -H 'Content-Type: application/json' \
         --data "{\"text\":\"MOSHINA BOR [$DEPLOYMENT_ENVIRONMENT] test alert from $(hostname) — please acknowledge\"}" \
         -o /dev/null -w 'webhook answered HTTP %{http_code}\n' )
   ```

   Expected: `HTTP 200`, and the message appears in the channel. A human acknowledges it.

4. **Verify a real alert path** (2 minutes of degraded staging, outside pilot hours):

   ```sh
   $ docker compose --env-file .env.staging -p moshina-bor-staging stop worker
   $ ./monitor.sh .env.staging; echo "exit=$?"        # exit=1 and "service worker is 'missing'"; message in the channel
   $ docker compose --env-file .env.staging -p moshina-bor-staging start worker
   $ ./monitor.sh .env.staging                        # "[staging] OK"
   ```

5. Confirm that the heartbeat monitor (§6) went red during step 4, because `monitor.sh` failed, and green again afterwards.

### Alert runbook

| Alert text                                         | First action                                                                                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service … is 'missing'/'exited'`                  | `docker compose … ps`, `… logs --tail 200 <service>`, `… up -d <service>`                                                                                            |
| `API readiness check failed`                       | Check postgres/redis health; `logs api`                                                                                                                              |
| `public https://… answered '000'` / certificate    | DNS, firewall, `logs edge` ([VPS_SETUP_GUIDE.md §8](VPS_SETUP_GUIDE.md))                                                                                             |
| `error-level log lines`                            | `logs --since 15m api worker \| grep '"level":50'`; consider maintenance mode                                                                                        |
| `no encrypted database backup newer than 26 hours` | `logs backup`; disk space; passphrase file present                                                                                                                   |
| `disk … % full`                                    | `docker image prune` (keep the last 3 versions), check `backups-staging/` and logs                                                                                   |
| `maintenance mode is ON`                           | Intentional? Otherwise switch it off in the admin panel                                                                                                              |
| `backup verification FAILED`                       | Run `./verify-backup.sh .env.staging` by hand. Check the passphrase file and the backup container logs. Treat this as **urgent**: there may be no restorable backup. |

## Validation

Sandbox, 2026-11-09:

| Item                                                                                                         | Result                                                                                                            |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `verify-backup.sh` on the newest sandbox backup                                                              | restored in a network-less container: 2 migrations, row counts printed, files archive readable; container removed |
| `verify-backup.sh` with a wrong passphrase                                                                   | exit 1; "backup verification FAILED" delivered to the webhook receiver                                            |
| S3 bucket with versioning + the lifecycle JSON above (moto 5.1.4)                                            | accepted and read back                                                                                            |
| `rclone copy … --include '*.gpg' --immutable --s3-no-check-bucket` (rclone 1.60.1, the Ubuntu 24.04 package) | 22/22 encrypted files uploaded; second run idempotent; plaintext decoy not uploaded; modified remote file refused |
| Download from the bucket → `verify-backup.sh` with explicit files                                            | BACKUP VERIFIED                                                                                                   |
| Crontab above (`crontab` install)                                                                            | accepted; a malformed line is rejected                                                                            |
| logrotate snippet (`logrotate -d`)                                                                           | parsed without errors (weekly, 12 rotations)                                                                      |
| Webhook test command                                                                                         | HTTP 200; message received                                                                                        |
| `monitor.sh`: clean / disk threshold / API stopped                                                           | OK / disk alert delivered / outage alert delivered (earlier drill)                                                |
| Real bucket, upload-key permission boundaries (no delete), real webhook, external uptime monitors            | **not verified**: blocked by external credentials                                                                 |
