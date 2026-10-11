#!/bin/sh
# Railway pre-deploy command of the Backend (server) service.
#   1. medusa db:migrate  - migrations, link sync and migration scripts (fatal on error).
#      On an empty database the starter's migration script seeds a demo store:
#      region, sales channel, publishable API key, shipping and four products.
#   2. railway-bootstrap  - admin user + publishable key check (non-fatal).
#   3. optional demo catalogue (SEED_DEMO_PRODUCTS=true, non-fatal, idempotent).
# Runs before the new deployment starts. Never run it on the Worker service.
set -eu

cd /app/apps/backend/.medusa/server
MEDUSA="/app/apps/backend/node_modules/.bin/medusa"

log() { printf '[predeploy] %s\n' "$*"; }

log "Running database migrations"
"$MEDUSA" db:migrate

log "Ensuring admin user and publishable API key"
if ! "$MEDUSA" exec ./src/scripts/railway-bootstrap.js; then
  log "WARNING: bootstrap did not complete (see errors above). Continuing the deploy."
fi

case "${SEED_DEMO_PRODUCTS:-false}" in
  true | 1 | yes)
    log "Seeding demo products (idempotent)"
    if ! "$MEDUSA" exec ./src/scripts/seed-demo-products.js; then
      log "WARNING: demo product seed failed. Continuing the deploy."
    fi
    ;;
esac

log "Done"
