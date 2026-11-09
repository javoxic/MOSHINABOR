#!/bin/sh
# Periodic PostgreSQL + uploaded-files backup with retention. Runs inside the "backup" service.
set -eu
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p /backups

backup_once() {
  ts="$(date +%Y%m%d-%H%M%S)"
  db_file="/backups/db-${ts}.dump"
  files_file="/backups/storage-${ts}.tar.gz"
  echo "[backup] ${ts} starting"
  pg_dump --format=custom --no-owner --no-privileges --file="${db_file}.partial"
  mv "${db_file}.partial" "${db_file}"
  # Verify the archive is readable before considering the backup good.
  pg_restore --list "${db_file}" > /dev/null
  tar -czf "${files_file}.partial" -C /storage . && mv "${files_file}.partial" "${files_file}"
  find /backups -type f \( -name 'db-*.dump' -o -name 'storage-*.tar.gz' \) -mtime +"${RETENTION}" -print -delete
  echo "[backup] ${ts} done: $(du -h "${db_file}" | cut -f1) database, $(du -h "${files_file}" | cut -f1) files"
}

if [ "${1:-loop}" = "once" ]; then
  backup_once
  exit 0
fi

until pg_isready -q; do sleep 2; done
while true; do
  if ! backup_once; then
    echo "[backup] FAILED at $(date)" >&2
  fi
  sleep "${INTERVAL}"
done
