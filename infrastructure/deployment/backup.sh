#!/bin/sh
# Periodic PostgreSQL + uploaded-files backup with retention. Runs inside the "backup" service.
#
# Encryption (recommended, required when BACKUP_REQUIRE_ENCRYPTION=true): mount a passphrase file
# (Compose secret) and set BACKUP_PASSPHRASE_FILE. Archives are then encrypted with GnuPG
# (AES-256, symmetric) and no plaintext copy is kept. Without a passphrase the backup refuses to
# run if encryption is required; otherwise it writes plaintext files readable only by their owner.
set -eu
umask 077

INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"
PASSFILE="${BACKUP_PASSPHRASE_FILE:-}"
REQUIRE_ENC="${BACKUP_REQUIRE_ENCRYPTION:-false}"
mkdir -p /backups

if [ -n "$PASSFILE" ]; then
  if [ ! -s "$PASSFILE" ]; then echo "[backup] passphrase file $PASSFILE is missing or empty" >&2; exit 1; fi
  if [ "$(wc -c < "$PASSFILE")" -lt 20 ]; then echo "[backup] passphrase must be at least 20 characters" >&2; exit 1; fi
  command -v gpg >/dev/null || { echo "[backup] gpg not available in this image" >&2; exit 1; }
elif [ "$REQUIRE_ENC" = "true" ]; then
  echo "[backup] BACKUP_REQUIRE_ENCRYPTION=true but BACKUP_PASSPHRASE_FILE is not set; refusing to write plaintext backups" >&2
  exit 1
fi

encrypt() { # $1 = plaintext file; replaces it with $1.gpg
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$PASSFILE" \
    --symmetric --cipher-algo AES256 --output "$1.gpg.partial" "$1"
  mv "$1.gpg.partial" "$1.gpg"
  rm -f "$1"
}

backup_once() {
  ts="$(date +%Y%m%d-%H%M%S)"
  db_file="/backups/db-${ts}.dump"
  files_file="/backups/storage-${ts}.tar.gz"
  echo "[backup] ${ts} starting"
  trap 'rm -f /backups/*.partial "${db_file}" "${files_file}"' EXIT
  pg_dump --format=custom --no-owner --no-privileges --file="${db_file}.partial"
  mv "${db_file}.partial" "${db_file}"
  # Verify the archive is readable before considering the backup good.
  pg_restore --list "${db_file}" > /dev/null
  tar -czf "${files_file}.partial" -C /storage . && mv "${files_file}.partial" "${files_file}"
  if [ -n "$PASSFILE" ]; then
    encrypt "${db_file}"
    encrypt "${files_file}"
    suffix=".gpg"
  else
    suffix=""
  fi
  trap - EXIT
  find /backups -type f \( -name 'db-*.dump*' -o -name 'storage-*.tar.gz*' \) -mtime +"${RETENTION}" -print -delete
  echo "[backup] ${ts} done: $(du -h "${db_file}${suffix}" | cut -f1) database, $(du -h "${files_file}${suffix}" | cut -f1) files${suffix:+ (encrypted)}"
}

if [ "${1:-loop}" = "once" ]; then
  backup_once
  exit 0
fi

until pg_isready -q; do sleep 2; done
while true; do
  if ! (backup_once); then
    echo "[backup] FAILED at $(date)" >&2
  fi
  sleep "${INTERVAL}"
done
