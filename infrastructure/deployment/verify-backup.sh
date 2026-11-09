#!/bin/sh
# Proves that an encrypted backup can be restored — without touching the live database.
#
# Usage: ./verify-backup.sh <env-file> [db-YYYYmmdd-HHMMSS.dump.gpg] [storage-YYYYmmdd-HHMMSS.tar.gz.gpg]
#   Without file arguments, the newest pair in BACKUP_DIR is used. Files downloaded back from the
#   off-server bucket can be passed explicitly (that is the real restore test).
#
# What it does: starts a throw-away PostgreSQL 16 container with NO network, decrypts the dump
# inside it with the env's backup passphrase, restores it, prints row counts and the latest
# migration, lists the files archive, and removes the container. Nothing is written to the host
# except the container's anonymous volume, which is removed with it.
# On failure it posts {"text": ...} to ALERT_WEBHOOK_URL (when set), so it can run from cron.
set -eu
cd "$(dirname "$0")" || exit 1
ENV_FILE="${1:?usage: verify-backup.sh <env-file> [db-dump.gpg] [storage.tar.gz.gpg]}"
case "$ENV_FILE" in /*|./*|../*) ;; *) ENV_FILE="./$ENV_FILE" ;; esac
# shellcheck disable=SC1090
. "$ENV_FILE"
NAME="moshina-bor-verify-$$"
finish() {
  rc=$?
  docker rm -f -v "$NAME" >/dev/null 2>&1 || true
  if [ "$rc" -ne 0 ] && [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    curl -fsS -m 10 -H 'Content-Type: application/json' \
      -d "{\"text\":\"MOSHINA BOR [${DEPLOYMENT_ENVIRONMENT:-?}] backup verification FAILED for $(basename "${DUMP:-unknown}") on $(hostname)\"}" \
      "$ALERT_WEBHOOK_URL" >/dev/null || echo "alert delivery failed"
  fi
  exit "$rc"
}
trap finish EXIT
trap 'exit 130' INT TERM
BDIR="${BACKUP_DIR:-./backups}"
PASS="${BACKUP_PASSPHRASE_PATH:-./secrets/backup_passphrase}"
DUMP="${2:-$(find "$BDIR" -maxdepth 1 -name 'db-*.dump.gpg' | sort | tail -n 1)}"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "no encrypted database dump found (looked in $BDIR)"; exit 1; }
FILES="${3:-$(printf '%s' "$DUMP" | sed 's#db-\([0-9-]*\)\.dump\.gpg$#storage-\1.tar.gz.gpg#')}"
[ -f "$PASS" ] || { echo "backup passphrase file $PASS not found"; exit 1; }
abs() { (cd "$(dirname "$1")" && printf '%s/%s' "$(pwd)" "$(basename "$1")"); }

echo "==> Verifying $(basename "$DUMP") in an isolated container"
docker run -d --rm --name "$NAME" --network none \
  -e POSTGRES_PASSWORD="verify-$$-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')" \
  -v "$(abs "$DUMP"):/in/db.dump.gpg:ro" -v "$(abs "$PASS"):/in/pass:ro" \
  postgres:16-bookworm >/dev/null
i=0
until docker exec "$NAME" pg_isready -q -U postgres 2>/dev/null; do
  i=$((i + 1)); [ "$i" -ge 60 ] && { echo "!! scratch database did not start"; exit 1; }; sleep 1
done
sleep 2 # the image restarts once after initdb

out="$(docker exec "$NAME" sh -ec '
  umask 077
  gpg --batch --quiet --pinentry-mode loopback --passphrase-file /in/pass --decrypt /in/db.dump.gpg > /tmp/db.dump
  pg_restore --list /tmp/db.dump > /dev/null
  createdb -U postgres restored
  pg_restore --no-owner --exit-on-error -U postgres -d restored /tmp/db.dump
  rm -f /tmp/db.dump
  psql -v ON_ERROR_STOP=1 -U postgres -d restored -At -F " " -c "
    SELECT '"'"'migrations applied:'"'"', count(*)::text FROM _prisma_migrations WHERE finished_at IS NOT NULL
    UNION ALL SELECT '"'"'latest migration:'"'"', max(migration_name) FROM _prisma_migrations
    UNION ALL SELECT '"'"'users:'"'"', count(*)::text FROM users
    UNION ALL SELECT '"'"'vehicles:'"'"', count(*)::text FROM vehicles
    UNION ALL SELECT '"'"'admin users:'"'"', count(*)::text FROM admin_users
    UNION ALL SELECT '"'"'pilot allowlist:'"'"', count(*)::text FROM access_allowlist"
')" || { echo "!! restore or sanity query failed"; exit 1; }
printf '%s\n' "$out" | sed 's/^/    /'
echo "ok:   database dump decrypted and restored"

if [ -f "$FILES" ]; then
  docker cp "$FILES" "$NAME:/tmp/files.tar.gz.gpg" >/dev/null
  n="$(docker exec "$NAME" sh -ec 'gpg --batch --quiet --pinentry-mode loopback --passphrase-file /in/pass --decrypt /tmp/files.tar.gz.gpg | tar -tzf - | wc -l')"
  echo "ok:   files archive $(basename "$FILES") decrypted and readable ($n entries)"
else
  echo "WARN: no matching files archive ($FILES)"
fi
echo "BACKUP VERIFIED: $(basename "$DUMP")"
