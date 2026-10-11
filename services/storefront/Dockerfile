# Medusa Next.js storefront image (Storefront service).
#
# Source: the official MIT-licensed medusajs/dtc-starter monorepo at a pinned
# commit (apps/storefront, Next.js 15). The build does not contact the backend:
# NEXT_PUBLIC_* values are build-time placeholders that railway/start.mjs
# replaces at container start (the publishable API key is fetched from the
# Backend over the private network then).
#
# NEXT_PUBLIC_STRIPE_KEY is the one real build-time value (optional). Railway
# passes it as a build argument from the service variable; changing it needs
# a redeploy (new build).

ARG NODE_IMAGE=node:24.21.0-bookworm-slim

FROM ${NODE_IMAGE} AS build
ARG PNPM_VERSION=10.11.1
ARG DTC_STARTER_REF=f677db438f27294fc50e4c7c6612e71ff38eeff5
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g "pnpm@${PNPM_VERSION}" && npm cache clean --force
WORKDIR /src
RUN curl -fsSL "https://codeload.github.com/medusajs/dtc-starter/tar.gz/${DTC_STARTER_REF}" \
  | tar -xz --strip-components=1
COPY overlay/ apps/storefront/
RUN pnpm install --frozen-lockfile --filter "@dtc/storefront..."

ARG NEXT_PUBLIC_STRIPE_KEY=""
# Placeholders: must match PLACEHOLDERS in railway/start.mjs.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_STRIPE_KEY=${NEXT_PUBLIC_STRIPE_KEY} \
    NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://medusa-backend-url.placeholder.invalid \
    NEXT_PUBLIC_BASE_URL=https://storefront-base-url.placeholder.invalid \
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_placeholder_runtime_publishable_key \
    NEXT_PUBLIC_DEFAULT_REGION=placeholderdefaultregion
RUN cd apps/storefront \
 && pnpm build \
 && rm -rf .next/cache \
 && mv .next .next-template

FROM ${NODE_IMAGE} AS runtime
# The placeholders above are not set here; start.mjs passes the real values
# to `next start` (next.config.js checks NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY).
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8000
WORKDIR /app
COPY --from=build --chown=node:node /src /app
COPY --chown=node:node railway/ /app/railway/
USER node
WORKDIR /app/apps/storefront
EXPOSE 8000
CMD ["node", "/app/railway/start.mjs"]
