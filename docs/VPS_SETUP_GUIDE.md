# VPS setup guide — MOSHINA BOR staging

**Audience:** the server operator.
**Result:** a hardened Ubuntu 24.04 host serving `staging.moshinabor.uz` and `admin-staging.moshinabor.uz` over HTTPS.
**Next step:** the application deployment in [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) §2 onwards.

> **Status:** Prepared but not verified on a real VPS. No server exists yet. On 2026-11-09 each command block below was checked as far as possible without a server (see [Validation](#validation)). Placeholders look like `<LIKE_THIS>`. **Never** replace a placeholder with a secret in a document, ticket or chat. Secrets are typed only on the server, into files with mode 600.

## 1. Server specification

| Item     | Minimum (pilot)                                                            | Recommended         | Why                                                                                                                                         |
| -------- | -------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| vCPU     | 2                                                                          | 4                   | Images are built on the server (pnpm, TypeScript, Vite); runtime is light                                                                   |
| RAM      | 4 GB                                                                       | 8 GB                | PostgreSQL + Redis + API + worker + nginx + Caddy ≈ 1.5 GB at runtime; builds peak higher                                                   |
| Disk     | 40 GB SSD                                                                  | 80 GB SSD           | Docker images (~2 GB per version; keep 3), database, uploads, 7 days of encrypted backups. Container logs are capped at 100 MB per service. |
| OS       | Ubuntu 24.04 LTS (x86_64)                                                  | same                | Commands below assume it                                                                                                                    |
| Network  | 1 static public IPv4                                                       | + provider firewall | Ports 80/443 public; 22 restricted to operators                                                                                             |
| Location | Tashkent, Frankfurt, Istanbul or another low-latency region for Uzbekistan |                     | Mobile API latency                                                                                                                          |
| Backups  | Provider snapshots optional                                                | Weekly snapshot     | Application backups are separate (BACKUP_MONITORING_SETUP.md)                                                                               |

Use a **dedicated** server for staging. Production must never share it.

Ask the provider for:

- a **static IPv4** address;
- **reverse DNS** set to `staging.moshinabor.uz`, if the panel offers it;
- **no** pre-installed control panel.

## 2. First login and base system (as root, from the provider console or first SSH session)

```sh
apt-get update && apt-get -y full-upgrade
apt-get install -y ca-certificates curl git openssl python3 ufw rclone cron unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades     # automatic security updates
timedatectl set-timezone Asia/Tashkent                     # cron times are local; containers set TZ themselves
hostnamectl set-hostname moshinabor-staging
```

Reboot if a kernel update was installed: `[ -f /var/run/reboot-required ] && reboot`.

## 3. Deploy user and SSH keys

On **each operator's machine**, if no key exists yet:

```sh
operator$ ssh-keygen -t ed25519 -C "<OPERATOR_NAME>@moshinabor-staging"
```

Send only the `.pub` file to the server admin. The private key never leaves the operator's machine.

On the server, as root:

```sh
adduser --disabled-password --gecos "" deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
install -m 600 -o deploy -g deploy /dev/null /home/deploy/.ssh/authorized_keys
nano /home/deploy/.ssh/authorized_keys      # paste one operator public key per line (ssh-ed25519 AAAA… name)
usermod -aG sudo deploy                     # optional: only if operators need sudo; then set a password with `passwd deploy`
```

**Before** hardening SSH, open a second terminal and confirm `ssh deploy@<SERVER_IP>` works with the key. Keep the root session open until §4 is verified.

## 4. SSH hardening

Create `/etc/ssh/sshd_config.d/00-moshinabor-hardening.conf`. Ubuntu 24.04 reads `sshd_config.d/*.conf` in name order before its own defaults, and sshd keeps the **first** value it reads for each option. The `00-` prefix makes these values win over provider files such as `50-cloud-init.conf`, which often set `PasswordAuthentication yes`.

```sh
cat > /etc/ssh/sshd_config.d/00-moshinabor-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
AllowUsers deploy
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
sshd -t && systemctl reload ssh
sshd -T | grep -E '^(permitrootlogin|passwordauthentication|authenticationmethods|allowusers) '
```

Expected:

```
permitrootlogin no
passwordauthentication no
allowusers deploy
authenticationmethods publickey
```

Then, from an operator machine, both of these must hold:

```sh
operator$ ssh deploy@<SERVER_IP> true && echo key-login-ok
operator$ ssh -o PubkeyAuthentication=no deploy@<SERVER_IP>   # must fail: "Permission denied (publickey)"
```

If `sshd -T` still shows `passwordauthentication yes`, another file in `/etc/ssh/sshd_config.d/` sorts before `00-…`. Fix or remove it, then run `sshd -t && systemctl reload ssh` again.

## 5. Firewall

```sh
ufw default deny incoming
ufw default allow outgoing
ufw limit from <OPERATOR_IP_1> to any port 22 proto tcp     # repeat for each operator IP / VPN egress
ufw allow 80/tcp                                            # ACME HTTP-01 challenge + redirect to HTTPS
ufw allow 443/tcp                                           # app and admin over HTTPS
ufw --force enable
ufw status verbose
```

If the provider has a network firewall ("security group"), apply the same three rules there as well. That is defence in depth, and it also protects the host before `ufw` is enabled.

**Docker and ufw:** ports published by Docker bypass ufw's INPUT rules. This stack publishes only:

- `80/443`: the Caddy edge (intended to be public);
- `127.0.0.1:8081`: the admin nginx, loopback only.

PostgreSQL and Redis are not published at all. **Never** add a `ports:` mapping to `postgres` or `redis`, and never change `HTTP_BIND` away from `127.0.0.1`. `check-config.sh` refuses the latter. Verify after deployment:

```sh
sudo ss -ltnp | grep -E ':(80|443|8081|5432|6379)\b'
# expected: 0.0.0.0:80, 0.0.0.0:443 (docker-proxy), 127.0.0.1:8081 — and nothing on 5432/6379
```

## 6. Docker Engine and Compose (official Docker repository)

```sh
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker deploy
systemctl enable --now docker
docker version --format 'engine {{.Server.Version}}' && docker compose version
```

Membership of the `docker` group is equivalent to root on this host. Only the `deploy` user gets it.

As `deploy` (log in again so the group applies): `docker run --rm hello-world`. If Docker Hub rate limits are hit during image pulls, log in with a free Docker Hub account: `docker login`. Its token is stored in `~/.docker/config.json`; keep that file mode 600.

### IPv6

Publish only **A** records (§7) unless you also enable IPv6 in Docker (`/etc/docker/daemon.json`: `"ipv6": true, "ip6tables": true` plus a ULA `fixed-cidr-v6`). Without it, IPv6 clients reach Caddy through `docker-proxy`. They then appear to come from Docker's internal network, so the admin IP filter rejects operators and per-IP rate limits merge all IPv6 users into one.

## 7. DNS

At the DNS provider for `moshinabor.uz`:

| Host            | Type | Value           | TTL |
| --------------- | ---- | --------------- | --- |
| `staging`       | A    | `<SERVER_IPV4>` | 300 |
| `admin-staging` | A    | `<SERVER_IPV4>` | 300 |

- Do **not** add AAAA records (see §6, IPv6).
- If the zone has CAA records, add `0 issue "letsencrypt.org"`.
- Lower the TTL to 300 before any server move.

Verify from an operator machine. The answers must be the server IP:

```sh
operator$ getent ahosts staging.moshinabor.uz | head -1
operator$ getent ahosts admin-staging.moshinabor.uz | head -1
operator$ dig +short CAA moshinabor.uz      # empty, or contains letsencrypt.org
```

## 8. HTTPS

Certificates are issued automatically by the `edge` (Caddy) container on the first `deploy.sh` run ([DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) §5), once these hold:

- DNS (§7) resolves to this server;
- ports 80 and 443 are open (§5);
- `.env.staging` has `API_DOMAIN`, `ADMIN_DOMAIN` and a real `ACME_EMAIL`;
- `CADDY_EXTRA_GLOBAL_OPTIONS` is **empty**.

`check-config.sh` refuses sandbox or staging CAs and non-standard ports.

Follow the issuance:

```sh
$ cd /srv/moshinabor/infrastructure/deployment
$ docker compose --env-file .env.staging -p moshina-bor-staging logs edge | grep -Ei 'certificate obtained|error'
```

Verify from an operator machine, with full certificate validation (no `-k`):

```sh
operator$ curl -sSI https://staging.moshinabor.uz/v1/health/live | head -1                       # HTTP/2 200
operator$ curl -sSI http://staging.moshinabor.uz/v1/health/live | grep -i '^location'            # https://…
operator$ echo | openssl s_client -connect staging.moshinabor.uz:443 -servername staging.moshinabor.uz 2>/dev/null \
            | openssl x509 -noout -issuer -enddate                                                # issuer: Let's Encrypt
operator$ ./verify-public.sh staging.moshinabor.uz admin-staging.moshinabor.uz staging allowed    # full public check
```

**Troubleshooting:**

- `NXDOMAIN` or wrong IP → DNS (§7).
- Connection timed out → firewall (§5) or the provider's firewall.
- `too many certificates` / rate limit → stop retrying, wait (Let's Encrypt limits), and do not delete the `caddydata` volume.
- Caddy logs show `tls-alpn-01` or `http-01` errors → port 80/443 is blocked or the A record points elsewhere.

## 9. Operator access summary

| Access      | How                                                                                            | Who                |
| ----------- | ---------------------------------------------------------------------------------------------- | ------------------ |
| SSH         | key-only, `deploy` user, from operator IPs                                                     | Server operator(s) |
| Admin panel | `https://admin-staging.moshinabor.uz` from `ADMIN_ALLOWED_IPS` only; named accounts with roles | Ops / support      |
| Database    | none from outside. `docker compose … exec postgres psql …` over SSH only                       | Server operator    |
| Secrets     | `.env.staging`, `secrets/` (mode 600) on the server; copies in the team password manager       | Server operator    |

## Validation

Performed on 2026-11-09, in an Ubuntu 24.04.5 environment without a real VPS:

| Block                                                    | Validation                                                                                                                                         | Result                                                                                                |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| §2 packages                                              | `apt-get install openssh-server ufw cron rclone` from the Ubuntu archive                                                                           | installed (rclone 1.60.1)                                                                             |
| §4 SSH hardening                                         | file installed in `/etc/ssh/sshd_config.d/`, `sshd -t`, `sshd -T`, also next to a simulated `50-cloud-init.conf` with `PasswordAuthentication yes` | valid; effective values as expected; the `00-` file wins (a `99-` file was shown to lose)             |
| §5 firewall                                              | `ufw --dry-run` for every rule                                                                                                                     | rules generated as expected (22 limited to the source IP; 80; 443)                                    |
| §6 Docker repository                                     | `download.docker.com/linux/ubuntu` suite `noble`, component `stable`                                                                               | `Release` reachable; docker-ce, containerd.io, buildx and compose plugins present for amd64           |
| §8 HTTPS checks                                          | `verify-public.sh` and `monitor.sh` against the sandbox staging stack                                                                              | correctly **reject** the sandbox (local-CA) certificate; pass when the drill CA is explicitly trusted |
| Real DNS, real Let's Encrypt issuance, provider firewall | —                                                                                                                                                  | **not verified**: no server or domain access                                                          |
