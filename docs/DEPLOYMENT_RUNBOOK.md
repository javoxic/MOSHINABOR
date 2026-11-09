# Deployment runbook — first public staging deployment

This is the exact procedure for putting MOSHINA BOR staging on a real server at `staging.moshinabor.uz` and `admin-staging.moshinabor.uz`. It needs the items in [EXTERNAL_DEPENDENCIES.md](EXTERNAL_DEPENDENCIES.md). Until someone runs it on a real server and the verification in step 8 passes, **staging is not deployed**.

Conventions:

- `$` = run as `deploy` on the server; `laptop$` = run on an operator machine.
- `<RELEASE_COMMIT>` = the full commit hash being released. For this release it is the head of `release/staging-pilot` named in the final report.
- Never paste a secret into a command line. The steps below write secrets straight into files with mode 600.

## 0. Pre-flight (operator)

- [ ] Every item in [EXTERNAL_DEPENDENCIES.md](EXTERNAL_DEPENDENCIES.md) §1, §2, §8, §11 and §12 exists. §4 (Eskiz) can follow later; until then sign-in answers 503, and nothing else is affected.
- [ ] [GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md) part A is complete.
- [ ] A maintenance window is announced (first deployment: none needed).

## 1. Server bootstrap (once, as root)

```sh
apt-get update && apt-get -y upgrade
apt-get install -y ca-certificates curl git openssl python3 ufw rclone
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
timedatectl set-timezone Asia/Tashkent       # host cron times; containers set TZ themselves

adduser --disabled-password --gecos "" deploy && usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
# put the operators' public keys into /home/deploy/.ssh/authorized_keys (mode 600, owner deploy)

# SSH: keys only, no root login
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/; s/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl reload ssh

# Firewall. Docker publishes only 80/443 (edge) and 127.0.0.1:8081 (admin nginx, loopback).
ufw default deny incoming && ufw default allow outgoing
ufw allow from <OPERATOR_IP> to any port 22 proto tcp     # repeat per operator IP
ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable
mkdir -p /srv/moshinabor && chown deploy:deploy /srv/moshinabor
```

Check: `ssh deploy@<server>` works from an operator IP, and `docker run --rm hello-world` works as `deploy`.

## 2. Code at the exact release commit

```sh
$ ssh-keygen -t ed25519 -N "" -f ~/.ssh/moshinabor_deploy      # add the .pub as a READ-ONLY deploy key on GitHub
$ printf 'Host github.com\n  IdentityFile ~/.ssh/moshinabor_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
$ git clone git@github.com:javoxic/MOSHINABOR.git /srv/moshinabor
$ cd /srv/moshinabor && git fetch origin release/staging-pilot && git checkout --detach <RELEASE_COMMIT>
$ git log -1 --format='%H %s'                                    # must print <RELEASE_COMMIT>
```

## 3. Environment file and backup passphrase

```sh
$ cd /srv/moshinabor/infrastructure/deployment
$ umask 077
$ cp .env.staging.example .env.staging
$ for v in POSTGRES_PASSWORD REDIS_PASSWORD JWT_ACCESS_SECRET JWT_ADMIN_SECRET OTP_PEPPER SMS_CALLBACK_SECRET; do
    sed -i "s|^$v=.*|$v=$(openssl rand -hex 32)|" .env.staging
  done
$ mkdir -p secrets && openssl rand -base64 48 > secrets/staging_backup_passphrase
$ chmod 600 .env.staging secrets/staging_backup_passphrase
$ nano .env.staging
```

In the editor, set:

| Variable                                        | Value                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| `API_DOMAIN` / `ADMIN_DOMAIN`                   | `staging.moshinabor.uz` / `admin-staging.moshinabor.uz`                               |
| `API_PUBLIC_URL`                                | `https://staging.moshinabor.uz`                                                       |
| `CORS_ORIGINS`                                  | `https://admin-staging.moshinabor.uz`                                                 |
| `ADMIN_ALLOWED_IPS`                             | `"<operator ip>/32 …"` (quoted). Replace the template's example addresses.            |
| `ACME_EMAIL`                                    | a monitored mailbox                                                                   |
| `ALERT_WEBHOOK_URL`                             | the https webhook from EXTERNAL_DEPENDENCIES §8                                       |
| `ESKIZ_EMAIL` / `ESKIZ_PASSWORD` / `ESKIZ_FROM` | from EXTERNAL_DEPENDENCIES §4. Leave empty until available: sign-in then answers 503. |
| `SMS_OTP_TEMPLATE_*`                            | only if Eskiz approved different wording                                              |
| `EXPO_ACCESS_TOKEN`                             | only with enhanced push security                                                      |

Leave unset: `CADDY_EXTRA_GLOBAL_OPTIONS`, `EDGE_HTTP_PORT`, `EDGE_HTTPS_PORT`, `SWAGGER_ENABLED`. Keep `DEPLOYMENT_ENVIRONMENT=staging`. The `APP_VERSION` line can stay as it is: `deploy.sh` sets the version.

**Copy `secrets/staging_backup_passphrase` into the team password manager now**, for example with `cat` over an SSH session into the password manager entry. Without it, no backup can ever be restored.

## 4. Configuration gate

```sh
$ ./check-config.sh .env.staging                 # must end with: CONFIG OK (./.env.staging)
```

Any `FAIL` blocks the deployment. Fix the value; never edit the checker. The only acceptable `WARN` is "Eskiz credentials empty", and only while §4 of EXTERNAL_DEPENDENCIES is pending. Never set `SANDBOX_DRILL` on this server.

## 5. Deploy

```sh
$ ./deploy.sh .env.staging "$(git rev-parse --short HEAD)"
```

What happens:

1. The config gate runs again.
2. The encrypted pre-deployment backup is skipped on the first deployment, because no database exists yet.
3. The `api` and `admin` images are built (10–20 min on 2 vCPU).
4. The stack starts, together with the Caddy edge.
5. Migrations and the seed run (permissions, roles, service types, notification templates; **no users, no admins**).
6. Readiness is awaited for up to 120 s.
7. The version is recorded in `.deploy-history-staging`.

Caddy requests the certificates in the first minute. Watch it with:

```sh
$ docker compose --env-file .env.staging -p moshina-bor-staging logs -f edge   # "certificate obtained successfully" for both hostnames
```

## 6. First administrator

```sh
$ read -r ADMIN_EMAIL; read -r ADMIN_NAME; stty -echo; read -r ADMIN_PASSWORD; stty echo
$ docker compose --env-file .env.staging -p moshina-bor-staging exec -e ADMIN_EMAIL="$ADMIN_EMAIL" \
    -e ADMIN_NAME="$ADMIN_NAME" -e ADMIN_PASSWORD="$ADMIN_PASSWORD" -e ADMIN_ROLE=SUPER_ADMIN \
    api /usr/local/bin/entrypoint.sh create-admin
$ unset ADMIN_PASSWORD
```

Then, from an allowed IP, open `https://admin-staging.moshinabor.uz`, sign in, and check:

- [ ] **Settings → General:** `access.registrationMode` = `allowlist` (the staging default) and `app.maintenanceMode` = Off.
- [ ] The amber **STAGING ENVIRONMENT** banner is shown.
- [ ] **Settings → System health:** database and Redis OK; SMS shows "configured" only if Eskiz is set.
- [ ] Create named accounts for the other operators with least-privilege roles. Do not share accounts.

## 7. Operations wiring

```sh
$ crontab -e
*/5 * * * * cd /srv/moshinabor/infrastructure/deployment && ./monitor.sh .env.staging >> monitor.log 2>&1
30 3 * * * rclone copy /srv/moshinabor/infrastructure/deployment/backups-staging staging-backups:moshinabor-staging --include '*.gpg' --immutable >> /srv/moshinabor/infrastructure/deployment/offsite.log 2>&1
```

- Configure the rclone remote `staging-backups` first, with `rclone config`.
- Configure the external uptime monitors (EXTERNAL_DEPENDENCIES §9).
- Then run `./monitor.sh .env.staging` once. It must print `[staging] OK`.

## 8. Verification (required before calling staging "deployed")

**From an operator machine whose IP is in `ADMIN_ALLOWED_IPS`:**

```sh
laptop$ git clone … && cd MOSHINABOR/infrastructure/deployment     # or copy verify-public.sh
laptop$ EXPECTED_IP=<server ip> ./verify-public.sh staging.moshinabor.uz admin-staging.moshinabor.uz staging allowed
```

**From a network that is not allowed**, for example a phone hotspot:

```sh
laptop$ ./verify-public.sh staging.moshinabor.uz admin-staging.moshinabor.uz staging denied
```

Both runs must end with `PUBLIC CHECKS PASSED`. Together they prove:

- DNS points at the server;
- the certificates are publicly trusted;
- http redirects to https, and HSTS is set;
- the API is ready and reports `deploymentEnvironment=staging`, with maintenance mode off;
- `/docs` and `/v1/admin/*` return 404 on the public API host;
- unauthenticated calls get 401;
- the admin host returns 200 from an allowed IP and 403 from any other.

**Pilot gate (no SMS is sent if it is working):** run once with a phone number you own that is **not** invited:

```sh
laptop$ VERIFY_UNINVITED_PHONE=+998XXXXXXXXX ./verify-public.sh staging.moshinabor.uz admin-staging.moshinabor.uz staging allowed
```

The run must print `PILOT_ACCESS_ONLY`. If that phone receives an SMS, pilot access is open: switch on maintenance mode and investigate.

**Backup and restore proof on the real host:**

1. `docker compose --env-file .env.staging -p moshina-bor-staging exec -T backup sh /scripts/backup.sh once` writes `db-*.dump.gpg` and `storage-*.tar.gz.gpg` with mode 600.
2. Run the restore drill in [ROLLBACK_PLAN.md §4](ROLLBACK_PLAN.md#4-restore-a-backup) into a scratch copy before inviting testers.

Record the results (date, commit, operator, outputs) in the release ticket. Only now is staging "deployed".

## 9. Open the pilot

1. Invite tester numbers: **Settings → Pilot access**.
2. Build and distribute the pilot apps: [PILOT_TEST_PLAN.md §10](PILOT_TEST_PLAN.md).
3. Execute the P1 cases of [PILOT_TEST_PLAN.md](PILOT_TEST_PLAN.md) on physical devices, then make the decision in [GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md) part D.

## 10. Later releases

```sh
$ cd /srv/moshinabor && git fetch origin && git checkout --detach <NEW_COMMIT>
$ cd infrastructure/deployment && ./deploy.sh .env.staging "$(git rev-parse --short HEAD)"
```

This takes an encrypted backup before deploying. If readiness fails, `deploy.sh` prints the rollback command.

## 11. Emergency and rollback (summary of [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md))

| Situation                   | Command / action                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Stop all mobile traffic now | Admin → Settings → `app.maintenanceMode` = On. Takes effect within ≤ 10 s; 0 s in the sandbox drill with one API instance.            |
| Admin panel unavailable     | The SQL fallback in ROLLBACK_PLAN §1                                                                                                  |
| Bad release, data intact    | `./rollback.sh .env.staging <previous-version>`                                                                                       |
| Bad release, bad data       | `./rollback.sh .env.staging <previous-version> --restore-db backups-staging/db-<ts>.dump.gpg backups-staging/storage-<ts>.tar.gz.gpg` |
| Stop reminders and push     | `docker compose --env-file .env.staging -p moshina-bor-staging stop worker`                                                           |

## Rehearsal (sandbox only)

The whole procedure, except the parts that need real DNS, a public CA and real accounts, was rehearsed in the development sandbox on 2026-11-09. The rehearsal used `SANDBOX_DRILL=1`, hostnames `*.localhost`, edge ports 8080/8443 and Caddy's local CA. The results are in [GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md#evidence). A rehearsal is not a deployment.
