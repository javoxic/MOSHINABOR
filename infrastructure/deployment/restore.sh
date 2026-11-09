#!/bin/sh
# Restore a database dump (and optionally uploaded files) into the running stack.
# Usage: ./restore.sh backups/db-YYYYmmdd-HHMMSS.dump [backups/storage-YYYYmmdd-HHMMSS.tar.gz]
# WARNING: replaces the current database contents. Stop api/worker first:
#   docker compose stop api worker
set -eu
DUMP="${1:?path to db-*.dump}"
FILES="${2:-}"
cd "$(dirname "$0")"
. ./.env
docker compose exec -T postgres pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$DUMP"
if [ -n "$FILES" ]; then
  docker compose run --rm -T -v "$(realpath "$FILES"):/restore.tar.gz:ro" --entrypoint sh api -c 'rm -rf /app/storage/* && tar -xzf /restore.tar.gz -C /app/storage'
fi
echo "Restore complete. Start the services again: docker compose up -d api worker"
