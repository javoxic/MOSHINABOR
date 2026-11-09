#!/bin/sh
# Roll back to a previously deployed image version.
#
# Usage: ./rollback.sh <env-file> <version> [--restore-db <db-dump.gpg> [storage.tar.gz.gpg]]
#
# Code-only rollback is safe when the newer release added only backward-compatible (additive)
# migrations, which is the policy for this project. If a release changed data irreversibly, add
# --restore-db with the backup taken by deploy.sh before that release (data written after the
# backup is lost — see docs/ROLLBACK_PLAN.md).
set -eu
cd "$(dirname "$0")"
ENV_FILE="${1:?usage: rollback.sh <env-file> <version> [--restore-db dump [files]]}"
VERSION="${2:?version to roll back to (see .deploy-history-*)}"
# shellcheck disable=SC1090
. "./$ENV_FILE"
: "${DEPLOYMENT_ENVIRONMENT:?DEPLOYMENT_ENVIRONMENT must be set}"
if [ "$DEPLOYMENT_ENVIRONMENT" = production ]; then PROJECT=moshina-bor; else PROJECT="moshina-bor-$DEPLOYMENT_ENVIRONMENT"; fi
HISTORY=".deploy-history-${DEPLOYMENT_ENVIRONMENT}"
dc() { APP_VERSION="$VERSION" docker compose --env-file "$ENV_FILE" -p "$PROJECT" "$@"; }

for img in api admin; do
  docker image inspect "${REGISTRY:-moshina-bor}/$img:$VERSION" >/dev/null 2>&1 || { echo "image ${REGISTRY:-moshina-bor}/$img:$VERSION not found locally (pull it first)"; exit 1; }
done

if [ "${3:-}" = "--restore-db" ]; then
  DUMP="${4:?dump file}"
  FILES="${5:-}"
  echo "==> Stopping api/worker and restoring $DUMP"
  dc stop api worker
  APP_VERSION="$VERSION" ENV_FILE="$ENV_FILE" ./restore.sh "$DUMP" $FILES
fi

echo "==> Starting $VERSION"
dc up -d --no-build api worker admin
i=0
until dc exec -T api node -e "fetch('http://127.0.0.1:3000/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; do
  i=$((i + 1)); [ "$i" -ge 60 ] && { echo "!! not ready after rollback"; exit 1; }; sleep 2
done
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $VERSION rollback" >> "$HISTORY"
echo "==> Rolled back to $VERSION"
dc ps --format '{{.Service}}: {{.Status}}'
