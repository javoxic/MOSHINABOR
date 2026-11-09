#!/bin/sh
# Lightweight health and error monitoring. Run from cron every 5 minutes on the host, e.g.:
#   */5 * * * * cd /opt/moshina-bor/infrastructure/deployment && ./monitor.sh .env >> monitor.log 2>&1
#
# Alerts (JSON POST {"text": ...} to ALERT_WEBHOOK_URL; Slack/Mattermost-compatible, Telegram via a
# small relay) when:
#   - a container is not running/healthy
#   - the API readiness check fails (database or Redis down)
#   - the API logged errors (level >= 50) in the last 5 minutes above ERROR_THRESHOLD (default 5)
#   - the newest encrypted backup is older than 26 hours
#   - a filesystem holding the deployment or Docker data is fuller than DISK_THRESHOLD % (default 85)
#   - maintenance mode is on (informational reminder)
#   - when API_DOMAIN is set: the edge container, the public HTTPS readiness URL (with full
#     certificate verification) and certificate expiry (< 14 days)
# MONITOR_CA_FILE (shell environment, sandbox drills only) trusts an extra CA for the public check.
# This script runs on the host: it cannot report a dead host. Add an external uptime monitor.
set -u
cd "$(dirname "$0")" || exit 1
ENV_FILE="${1:-.env}"
case "$ENV_FILE" in /*|./*|../*) ;; *) ENV_FILE="./$ENV_FILE" ;; esac # relative paths are relative to this directory
# shellcheck disable=SC1090
. "$ENV_FILE"
ENVNAME="${DEPLOYMENT_ENVIRONMENT:-production}"
if [ "$ENVNAME" = production ]; then PROJECT=moshina-bor; else PROJECT="moshina-bor-$ENVNAME"; fi
export APP_VERSION="${APP_VERSION:-$(tail -n 1 ".deploy-history-$ENVNAME" 2>/dev/null | cut -d' ' -f2)}"
dc() { docker compose --env-file "$ENV_FILE" -p "$PROJECT" "$@"; }
problems=""
add() { problems="${problems}- $1\n"; }

services="postgres redis api worker admin backup"
[ -n "${API_DOMAIN:-}" ] && services="$services edge"
for svc in $services; do
  state="$(dc ps --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null | awk -v s="$svc" '$1==s {print $2" "$3}')"
  case "$state" in
    "running healthy"|"running "|"running starting") ;; # starting = within the healthcheck start period
    *) add "service $svc is '${state:-missing}'" ;;
  esac
done

if ! dc exec -T api node -e "fetch('http://127.0.0.1:3000/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
  add "API readiness check failed (database or Redis unavailable)"
fi

if [ -n "${API_DOMAIN:-}" ]; then
  port="${EDGE_HTTPS_PORT:-443}"; hostport="$API_DOMAIN"; [ "$port" = 443 ] || hostport="$API_DOMAIN:$port"
  code="$(curl -sS -o /dev/null -w '%{http_code}' -m 15 --noproxy "$API_DOMAIN" ${MONITOR_CA_FILE:+--cacert "$MONITOR_CA_FILE"} "https://$hostport/v1/health/ready" 2>/dev/null || true)"
  [ "$code" = 200 ] || add "public https://$hostport/v1/health/ready answered '${code:-no response}' (TLS, DNS or edge problem)"
  # Expiry check skipped only in sandbox drills (MONITOR_CA_FILE): the local CA issues 12-hour certificates.
  if [ -z "${MONITOR_CA_FILE:-}" ] && command -v openssl >/dev/null 2>&1; then
    cert="$(echo | openssl s_client -connect "127.0.0.1:$port" -servername "$API_DOMAIN" 2>/dev/null | openssl x509 2>/dev/null || true)"
    if [ -z "$cert" ]; then add "could not read the TLS certificate of $API_DOMAIN"
    elif ! printf '%s\n' "$cert" | openssl x509 -noout -checkend 1209600 >/dev/null 2>&1; then add "TLS certificate of $API_DOMAIN expires within 14 days"; fi
  fi
fi

errors="$(dc logs --since 5m api worker 2>/dev/null | grep -cE '"level":(50|60)' || true)"
if [ "${errors:-0}" -gt "${ERROR_THRESHOLD:-5}" ]; then
  add "$errors error-level log lines in the last 5 minutes (threshold ${ERROR_THRESHOLD:-5})"
fi

for path in . /var/lib/docker; do
  [ -d "$path" ] || continue
  used="$(df -P "$path" 2>/dev/null | awk 'NR==2 {gsub("%", "", $5); print $5}')"
  if [ -n "$used" ] && [ "$used" -ge "${DISK_THRESHOLD:-85}" ]; then
    add "disk $(df -P "$path" | awk 'NR==2 {print $6}') is ${used}% full (threshold ${DISK_THRESHOLD:-85}%)"
  fi
done

newest="$(find "${BACKUP_DIR:-./backups}" -name 'db-*.dump.gpg' -mmin -1560 2>/dev/null | head -n 1)"
[ -n "$newest" ] || add "no encrypted database backup newer than 26 hours in ${BACKUP_DIR:-./backups}"

maint="$(dc exec -T api node -e "fetch('http://127.0.0.1:3000/v1/app-config').then(r=>r.json()).then(j=>console.log(j.maintenanceMode))" 2>/dev/null || true)"
[ "$maint" = "true" ] && add "maintenance mode is ON (mobile users are blocked)"

if [ -n "$problems" ]; then
  text="$(printf 'MOSHINA BOR [%s] %s\n%b' "$ENVNAME" "$(date -u +%Y-%m-%dT%H:%MZ)" "$problems")"
  printf '%s\n' "$text"
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    payload="$(printf '%s' "$text" | python3 -c 'import json,sys; print(json.dumps({"text": sys.stdin.read()}))' 2>/dev/null || printf '{"text":"MOSHINA BOR alert"}')"
    curl -fsS -m 10 -H 'Content-Type: application/json' -d "$payload" "$ALERT_WEBHOOK_URL" >/dev/null || echo "alert delivery failed"
  fi
  exit 1
fi
echo "$(date -u +%Y-%m-%dT%H:%MZ) [$ENVNAME] OK"
