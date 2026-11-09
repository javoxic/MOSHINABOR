#!/bin/sh
# Restore a database dump (and optionally uploaded files) into the running stack.
# Usage: [ENV_FILE=.env.staging] ./restore.sh backups/db-YYYYmmdd-HHMMSS.dump[.gpg] [backups/storage-YYYYmmdd-HHMMSS.tar.gz[.gpg]]
# ENV_FILE defaults to .env (production). The compose project is derived from DEPLOYMENT_ENVIRONMENT.
# Encrypted (.gpg) archives are decrypted with the passphrase file at $BACKUP_PASSPHRASE_PATH
# (default ./secrets/backup_passphrase).
# WARNING: replaces the current database contents. Stop api/worker first:
#   docker compose stop api worker
set -eu
umask 077
DUMP="${1:?path to db-*.dump or db-*.dump.gpg}"
FILES="${2:-}"
cd "$(dirname "$0")"
ENV_FILE="${ENV_FILE:-.env}"
case "$ENV_FILE" in /*|./*|../*) ;; *) ENV_FILE="./$ENV_FILE" ;; esac # relative paths are relative to this directory
# shellcheck disable=SC1090
. "$ENV_FILE"
if [ "${DEPLOYMENT_ENVIRONMENT:-production}" = production ]; then PROJECT=moshina-bor; else PROJECT="moshina-bor-$DEPLOYMENT_ENVIRONMENT"; fi
export APP_VERSION="${APP_VERSION:-$(tail -n 1 ".deploy-history-${DEPLOYMENT_ENVIRONMENT:-production}" 2>/dev/null | cut -d' ' -f2)}"
dc() { docker compose --env-file "$ENV_FILE" -p "$PROJECT" "$@"; }
PASS="${BACKUP_PASSPHRASE_PATH:-./secrets/backup_passphrase}"

decrypted() { # prints a path to a plaintext copy of $1 (decrypting .gpg files into a temp dir)
  case "$1" in
    *.gpg)
      tmp="$(mktemp -d)"
      out="$tmp/$(basename "${1%.gpg}")"
      docker run --rm -v "$(realpath "$1"):/in:ro" -v "$(realpath "$PASS"):/pass:ro" -v "$tmp:/out" postgres:16-bookworm \
        gpg --batch --quiet --pinentry-mode loopback --passphrase-file /pass --output "/out/$(basename "$out")" --decrypt /in
      echo "$out" ;;
    *) echo "$1" ;;
  esac
}

DB_PLAIN="$(decrypted "$DUMP")"
dc exec -T postgres pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$DB_PLAIN"
if [ -n "$FILES" ]; then
  FILES_PLAIN="$(decrypted "$FILES")"
  dc run --rm -T -v "$(realpath "$FILES_PLAIN"):/restore.tar.gz:ro" --entrypoint sh api -c 'rm -rf /app/storage/* && tar -xzf /restore.tar.gz -C /app/storage'
fi
case "$DUMP" in *.gpg) rm -f "$DB_PLAIN" && rmdir "$(dirname "$DB_PLAIN")" ;; esac
case "$FILES" in *.gpg) rm -f "$FILES_PLAIN" && rmdir "$(dirname "$FILES_PLAIN")" ;; esac
echo "Restore complete ($PROJECT). Start the services again (or let rollback.sh do it)."
