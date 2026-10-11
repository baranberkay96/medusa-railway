# Medusa v2 backend image, used by both the Backend (server) and Worker services.
#
# Source: the official MIT-licensed medusajs/dtc-starter monorepo at a pinned
# commit (apps/backend, Medusa 2.21.2). Template files from ./overlay replace
# medusa-config.ts and add a bootstrap script and an internal route.
#
# Build arguments Railway passes from service variables:
#   DISABLE_MEDUSA_ADMIN=true  skips the admin dashboard build (Worker).
# To upgrade: change DTC_STARTER_REF to a newer commit and check that its
# apps/backend/package.json Medusa version matches MEILISEARCH_PLUGIN_VERSION
# (see the plugin's compatibility table).

ARG NODE_IMAGE=node:24.21.0-bookworm-slim

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION=10.11.1
ENV MEDUSA_DISABLE_TELEMETRY=true
RUN npm install -g "pnpm@${PNPM_VERSION}" && npm cache clean --force

# ---- source + full install + build ------------------------------------------
FROM base AS build
ARG DTC_STARTER_REF=f677db438f27294fc50e4c7c6612e71ff38eeff5
ARG MEILISEARCH_PLUGIN_VERSION=2.3.1
ARG DISABLE_MEDUSA_ADMIN=false
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN curl -fsSL "https://codeload.github.com/medusajs/dtc-starter/tar.gz/${DTC_STARTER_REF}" \
  | tar -xz --strip-components=1
COPY overlay/ apps/backend/
RUN pnpm install --frozen-lockfile --filter "@dtc/backend..." \
 && pnpm --filter @dtc/backend add --save-exact "@rokmohar/medusa-plugin-meilisearch@${MEILISEARCH_PLUGIN_VERSION}"
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN cd apps/backend && DISABLE_MEDUSA_ADMIN="${DISABLE_MEDUSA_ADMIN}" pnpm exec medusa build

# ---- production dependencies only (same lockfile) ---------------------------
FROM base AS prod-deps
WORKDIR /app
COPY --from=build /src/package.json /src/pnpm-lock.yaml /src/pnpm-workspace.yaml /src/.npmrc ./
COPY --from=build /src/apps/backend/package.json apps/backend/package.json
COPY --from=build /src/apps/storefront/package.json apps/storefront/package.json
RUN pnpm install --frozen-lockfile --prod --filter "@dtc/backend..."

# ---- runtime ----------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    MEDUSA_DISABLE_TELEMETRY=true \
    HOST=:: \
    PORT=9000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app /app
# Compiled server (+ admin build). Modules resolve from apps/backend/node_modules
# through normal Node parent-directory lookup.
COPY --from=build --chown=node:node /src/apps/backend/.medusa/server /app/apps/backend/.medusa/server
COPY --chown=node:node scripts/ /app/scripts/
USER node
WORKDIR /app/apps/backend/.medusa/server
EXPOSE 9000
CMD ["sh", "/app/scripts/start.sh"]
