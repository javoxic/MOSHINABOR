#!/bin/sh
set -eu
# Usage: entrypoint.sh api|worker|migrate|seed|create-admin
cmd="${1:-api}"
case "$cmd" in
  migrate)
    exec npx prisma migrate deploy
    ;;
  seed)
    exec node dist/scripts/seed.js
    ;;
  create-admin)
    exec node dist/scripts/create-admin.js
    ;;
  api)
    if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
      npx prisma migrate deploy
      node dist/scripts/seed.js
    fi
    export PROCESS_ROLE="${PROCESS_ROLE:-api}"
    exec node dist/main.js
    ;;
  worker)
    export PROCESS_ROLE=worker
    exec node dist/worker.js
    ;;
  *)
    exec "$@"
    ;;
esac
