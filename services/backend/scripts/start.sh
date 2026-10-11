#!/bin/sh
# Container start command for the Backend (server) and Worker services.
# The Worker waits for the server's health endpoint first, so it does not
# boot against a database whose migrations (Backend pre-deploy) are not done.
set -eu

cd /app/apps/backend/.medusa/server

if [ "${MEDUSA_WORKER_MODE:-shared}" = "worker" ] && [ -n "${MEDUSA_SERVER_HEALTH_URL:-}" ]; then
  if ! node /app/scripts/wait-for-http.mjs "$MEDUSA_SERVER_HEALTH_URL" "${WAIT_FOR_SERVER_TIMEOUT_SECONDS:-840}"; then
    echo "[start] Server not healthy yet; starting the worker anyway."
  fi
fi

exec /app/apps/backend/node_modules/.bin/medusa start
