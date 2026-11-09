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
#   - maintenance mode is on (informational reminder)
set -u
cd "$(dirname "$0")"
ENV_FILE="${1:-.env}"
# shellcheck disable=SC1090
. "./$ENV_FILE"
ENVNAME="${DEPLOYMENT_ENVIRONMENT:-production}"
if [ "$ENVNAME" = production ]; then PROJECT=moshina-bor; else PROJECT="moshina-bor-$ENVNAME"; fi
export APP_VERSION="${APP_VERSION:-$(tail -n 1 ".deploy-history-$ENVNAME" 2>/dev/null | cut -d' ' -f2)}"
dc() { docker compose --env-file "$ENV_FILE" -p "$PROJECT" "$@"; }
problems=""
add() { problems="${problems}- $1\n"; }

for svc in postgres redis api worker admin backup; do
  state="$(dc ps --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null | awk -v s="$svc" '$1==s {print $2" "$3}')"
  case "$state" in
    "running healthy"|"running ") ;;
    *) add "service $svc is '${state:-missing}'" ;;
  esac
done

if ! dc exec -T api node -e "fetch('http://127.0.0.1:3000/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
  add "API readiness check failed (database or Redis unavailable)"
fi

errors="$(dc logs --since 5m api worker 2>/dev/null | grep -cE '"level":(50|60)' || true)"
if [ "${errors:-0}" -gt "${ERROR_THRESHOLD:-5}" ]; then
  add "$errors error-level log lines in the last 5 minutes (threshold ${ERROR_THRESHOLD:-5})"
fi

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
