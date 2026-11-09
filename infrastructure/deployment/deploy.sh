#!/bin/sh
# Safe deployment: preflight → encrypted backup → build/tag → start → health gate.
#
# Usage: ./deploy.sh <env-file> [version]
#   env-file  .env (production) or .env.staging
#   version   image tag to deploy (default: current git short SHA)
# Env:
#   SKIP_BUILD=1     use images already tagged <REGISTRY>/{api,admin}:<version> (CI-built or pulled)
#   COMPOSE_PROFILES=edge  also run the HTTPS edge proxy
set -eu
cd "$(dirname "$0")"
ENV_FILE="${1:?usage: deploy.sh <env-file> [version]}"
case "$ENV_FILE" in /*|./*|../*) ;; *) ENV_FILE="./$ENV_FILE" ;; esac # relative paths are relative to this directory
VERSION="${2:-$(git rev-parse --short HEAD 2>/dev/null || true)}"
[ -n "$VERSION" ] || { echo "version required"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE"; exit 1; }

# shellcheck disable=SC1090
. "$ENV_FILE"
: "${DEPLOYMENT_ENVIRONMENT:?DEPLOYMENT_ENVIRONMENT must be set in $ENV_FILE}"
if [ "$DEPLOYMENT_ENVIRONMENT" = production ]; then PROJECT=moshina-bor; else PROJECT="moshina-bor-$DEPLOYMENT_ENVIRONMENT"; fi
HISTORY=".deploy-history-${DEPLOYMENT_ENVIRONMENT}"
# The bundled HTTPS edge (Caddy) runs whenever public hostnames are configured.
if [ -n "${API_DOMAIN:-}" ]; then export COMPOSE_PROFILES="${COMPOSE_PROFILES:-edge}"; fi
dc() { APP_VERSION="$VERSION" docker compose --env-file "$ENV_FILE" -p "$PROJECT" "$@"; }

echo "==> Preflight ($PROJECT, version $VERSION)"
./check-config.sh "$ENV_FILE" || { echo "!! Fix the configuration before deploying."; exit 1; }
dc config --quiet
PREVIOUS="$(tail -n 1 "$HISTORY" 2>/dev/null | cut -d' ' -f2 || true)"

if dc ps --status running --services 2>/dev/null | grep -qx postgres; then
  echo "==> Encrypted pre-deployment backup"
  dc exec -T backup sh /scripts/backup.sh once
else
  echo "==> First deployment: no running database to back up"
fi

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "==> Building images $VERSION"
  dc build api admin
fi

echo "==> Starting $VERSION"
dc up -d --no-build --remove-orphans

echo "==> Waiting for API readiness"
i=0
until dc exec -T api node -e "fetch('http://127.0.0.1:3000/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "!! API did not become ready within 120 s."
    [ -n "$PREVIOUS" ] && echo "!! Roll back with: ./rollback.sh $ENV_FILE $PREVIOUS" || echo "!! No previous version recorded."
    exit 1
  fi
  sleep 2
done

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $VERSION" >> "$HISTORY"
echo "==> Deployed $VERSION (previous: ${PREVIOUS:-none})"
dc ps --format '{{.Service}}: {{.Status}}'
