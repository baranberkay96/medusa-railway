# Medusa v2 Commerce Store (Backend + Storefront) — Railway template spec

## Listing

| Field | Value |
|---|---|
| Name | **Medusa v2 Commerce Store (Backend + Storefront)** (version label `v2` = Medusa major version; Medusa tags releases `v2.x.y`, pinned `v2.21.2`) |
| Description | Headless e-commerce with admin, Next.js storefront, search and background workers. (82 chars, unchanged from LISTINGS.md) |
| Category | Other |
| Tags | medusa, ecommerce, headless-commerce, nextjs, meilisearch, postgres, redis |
| User input at deploy | **None required.** Recommended: set `MEDUSA_ADMIN_EMAIL` (Backend) to your own address. Optional later: Stripe keys. |

Every promise in the description is delivered: admin dashboard (Backend `/app`), Next.js storefront, search (Medusa Search Module with Meilisearch as engine) and background workers (separate Worker service, scalable).

## Base market template

- **`gkU-27` "Medusajs 2.0 + Next.js Storefront"** (3,262 projects, 824 active) — chosen as base for the service layout: Backend, Storefront, Postgres, Redis, Meilisearch, Railway Bucket and a small proxy that makes bucket files public. Kept that layout and the bucket-proxy idea. Replaced the source (community boilerplate → official `medusajs/dtc-starter` at a pinned commit), removed Meilisearch's public domain and the storefront's direct Meilisearch access, removed Redis/Postgres TCP proxies, fixed CORS values that listed private domains, added a separate worker, and removed the storefront's build-time dependency on a running backend.
- `zC7eOq` "(v1) Medusa Backend with Worker Modes" (2,007 projects, 0 recent) — took the server/worker split via `MEDUSA_WORKER_MODE`. Rejected the rest: Medusa v1 commands (`medusa migrations run`), hardcoded `supersecret` JWT/cookie secrets, unpinned `bitnami/redis`, no storefront.
- `Fb6KUX` "Medusajs 2.0 + Storefront (TRIAL)" (542 projects) — trial variant of `gkU-27` storing uploads on a backend volume. Rejected: ties files to one container (no replicas), no search, no worker.
- `_upstream/medusajs__medusa-starter-default` — no LICENSE file in the repo (its `package.json` declares MIT). Reference only; superseded upstream by `medusajs/dtc-starter`, which this template builds from.
- `_upstream/rpuls__medusajs-2.0-for-railway-boilerplate` — LICENSE text is MIT (GitHub reports NOASSERTION because of an added attribution paragraph). Read for ideas only (runtime key exchange, Meilisearch plugin choice); no files or text copied.
- `medusajs/nextjs-starter-medusa` (MIT) is archived and points to `medusajs/dtc-starter`; not used.

## Pinned versions

| Service | Image / source | Tag | Release date | Checked |
|---|---|---|---|---|
| Backend, Worker | `medusajs/dtc-starter` `apps/backend` built by `services/backend/Dockerfile` | commit `f677db438f27294fc50e4c7c6612e71ff38eeff5` (Medusa `2.21.2`) | commit 2026-10-09, Medusa 2026-09-28 | 2026-10-10 |
| Backend, Worker (search engine plugin) | `@rokmohar/medusa-plugin-meilisearch` (npm) | `2.3.1` | 2026-10-03 | 2026-10-10 |
| Storefront | `medusajs/dtc-starter` `apps/storefront` built by `services/storefront/Dockerfile` | same commit (Next.js `15.5.24`) | 2026-10-09 | 2026-10-10 |
| Backend, Worker, Storefront base image | `node` | `24.21.0-bookworm-slim` (Node 24 LTS; starter requires >= 22.22) | 2026-10-06 | 2026-10-10 |
| Package manager | `pnpm` | `10.11.1` (starter's `packageManager`) | — | 2026-10-10 |
| Media-Proxy | `oven/bun` + own `server.ts` | `1.4.2-alpine` | 2026-09-05 | 2026-10-10 |
| Meilisearch | `getmeili/meilisearch` (Community Edition) | `v1.54.3` | 2026-10-01 | 2026-10-10 |
| Postgres | `ghcr.io/railwayapp-templates/postgres-ssl` | `18` | Railway base | 2026-10-10 |
| Redis | `redis` | `8.2` | Railway base | 2026-10-10 |

- `dtc-starter` has no tags, so the commit is pinned. It is the current official Medusa starter (backend + Next.js storefront monorepo).
- Bun `1.4.3` was published on the check date; `1.4.2` is pinned until the new patch has some field time.
- Upgrade path: set `DTC_STARTER_REF` in both Dockerfiles to a newer commit, then check its `apps/backend/package.json` Medusa version against the Meilisearch plugin's compatibility table (the plugin pins one Medusa minor per plugin line) and update `MEILISEARCH_PLUGIN_VERSION`. Migrations run automatically in the Backend pre-deploy step. For Meilisearch, take a snapshot or dump first, change the tag and start once with `/bin/meilisearch --upgrade-db` (available since v1.51) per Meilisearch's upgrade guide.

## Architecture

The Backend serves the Store/Admin APIs and the admin dashboard; the Worker runs subscribers, scheduled jobs, workflows and search indexing from the same image. The Storefront is the official Next.js starter. Uploads go to a private Railway Bucket and are served publicly by Media-Proxy. Meilisearch is private; the storefront searches through the Backend's `POST /store/search`.

```
 Browser ──https──► Storefront (Next.js, public)        Browser ──https──► Backend /app (admin)
    │                  │  SSR + browser calls (public URL)        │
    │                  └──────────────────────────────►  Backend (Medusa server, public)
    │                  └─ at start: GET /internal/publishable-key ─┘ (private network, token)
    │
    └─ <img> ──https──► Media-Proxy (Bun, public) ──S3 GET──► Railway Bucket (private, S3 API)
                                                                  ▲
 Backend ──private──► Postgres, Redis, Meilisearch                │ S3 PUT/DELETE (uploads)
 Worker  ──private──► Postgres, Redis, Meilisearch ───────────────┘
 Worker  ──private──► Backend /health (waits before first start)
```

Public: Backend, Storefront, Media-Proxy. Private only: Worker, Meilisearch, Postgres, Redis. Buckets are reachable only over the public S3 endpoint (Railway limitation).

### Publishable API key without a build-time backend

Next.js inlines `NEXT_PUBLIC_*` values at build time, and Railway builds have no private network, while the publishable key only exists after the Backend migrated its database. The template therefore:

1. Builds the storefront with placeholder values (`services/storefront/Dockerfile`). The pinned starter commit no longer pre-renders pages at build time, so the build does not call the backend.
2. On first `medusa db:migrate` (Backend pre-deploy) the starter's migration script creates the demo store, including a publishable key linked to the default sales channel. `railway-bootstrap` re-checks this on every deploy.
3. At container start, `railway/start.mjs` fetches the key from `GET /internal/publishable-key` on the Backend's private address (protected by `STOREFRONT_BOOTSTRAP_TOKEN`), copies the pristine build and replaces the placeholders with the real backend URL, base URL, region and key, then starts `next start`. It waits up to `KEY_WAIT_TIMEOUT_SECONDS` for the Backend.
4. `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` can still be set by hand to skip the lookup.

## Services

### Backend
- Source: repo `baranberkay96/medusa-railway`, root `/services/backend` (Dockerfile: downloads `medusajs/dtc-starter` at the pinned commit, applies `overlay/`, adds the Meilisearch plugin, `medusa build`, production-only install from the same lockfile).
- Start command: image `CMD` (`sh /app/scripts/start.sh` → `medusa start` in `.medusa/server`, listening on `::`).
- Pre-deploy: `sh /app/scripts/predeploy.sh` → `medusa db:migrate` (fatal on error), then `railway-bootstrap` (admin user + publishable key, non-fatal), then optional demo catalogue when `SEED_DEMO_PRODUCTS=true`.
- Healthcheck: `/health`, timeout 600 s. Public domain: yes, target port 9000. TCP proxy: none. Volume: none (files go to the Bucket).
- Restart policy: ON_FAILURE (10). Replicas: 1 (stateless; can be raised, sessions live in Redis). Cron: none.

| Variable | Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Run Medusa in production mode. |
| `PORT` | `9000` | HTTP port Medusa listens on (also used by the Railway healthcheck). |
| `MEDUSA_WORKER_MODE` | `server` | This instance only serves HTTP; background jobs run on the Worker service. |
| `DISABLE_MEDUSA_ADMIN` | `false` | Keep false here: this service builds and serves the admin dashboard at /app. |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Postgres connection string over the private network. |
| `REDIS_URL` | `${{Redis.REDIS_URL}}?family=0` | Redis for sessions, events, workflows, locking and cache; family=0 enables IPv4+IPv6 lookup. |
| `JWT_SECRET` | `${{secret(64)}}` | Secret used to sign auth tokens. Generated; shared with the Worker. |
| `COOKIE_SECRET` | `${{secret(64)}}` | Secret used to sign session cookies. Generated; shared with the Worker. |
| `MEDUSA_BACKEND_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | Public URL of this backend (admin and API). |
| `STORE_CORS` | `https://${{Storefront.RAILWAY_PUBLIC_DOMAIN}}` | Origins allowed to call the Store API (comma-separate extra domains). |
| `ADMIN_CORS` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | Origins allowed to call the Admin API (the admin is served from this domain). |
| `AUTH_CORS` | `https://${{RAILWAY_PUBLIC_DOMAIN}},https://${{Storefront.RAILWAY_PUBLIC_DOMAIN}}` | Origins allowed to call the auth routes (admin and storefront). |
| `MEDUSA_ADMIN_EMAIL` | `admin@example.com` | Login email of the first admin user, created on first deploy. Change it to your own address before deploying. |
| `MEDUSA_ADMIN_PASSWORD` | `${{secret(24, "<alphanumeric>")}}` | Password of the first admin user (generated). Only used to create the user. |
| `STOREFRONT_BOOTSTRAP_TOKEN` | `${{secret(48, "abcdef0123456789")}}` | Shared token the Storefront uses to fetch the publishable API key at start. |
| `SEED_DEMO_PRODUCTS` | `false` | `true` adds 50 extra demo products on the next deploy (idempotent). The base demo store is always created on first migration. |
| `S3_FILE_URL` | `https://${{Media-Proxy.RAILWAY_PUBLIC_DOMAIN}}` | Public base URL for uploaded files (Media-Proxy, because Buckets are private). |
| `S3_BUCKET` | `${{Bucket.BUCKET}}` | Bucket name used for the S3 API. |
| `S3_REGION` | `${{Bucket.REGION}}` | Bucket region (usually `auto`). |
| `S3_ENDPOINT` | `${{Bucket.ENDPOINT}}` | S3 API endpoint of the Railway Bucket (public network only). |
| `S3_ACCESS_KEY_ID` | `${{Bucket.ACCESS_KEY_ID}}` | Bucket access key ID. |
| `S3_SECRET_ACCESS_KEY` | `${{Bucket.SECRET_ACCESS_KEY}}` | Bucket secret access key. |
| `S3_FORCE_PATH_STYLE` | `false` | `true` only for older Buckets that require path-style URLs (see the bucket's Credentials tab). |
| `MEILISEARCH_HOST` | `http://${{Meilisearch.RAILWAY_PRIVATE_DOMAIN}}:${{Meilisearch.PORT}}` | Meilisearch over the private network. Clear it (Backend and Worker) to use Medusa's built-in PostgreSQL search. |
| `MEILISEARCH_API_KEY` | `${{Meilisearch.MEILI_MASTER_KEY}}` | Key used by the backend to manage and query indexes. |
| `STRIPE_API_KEY` | empty (optional) | Stripe secret key; enables the Stripe payment provider (enable it per region in the admin). |
| `STRIPE_WEBHOOK_SECRET` | empty (optional) | Stripe webhook signing secret for `<backend URL>/hooks/payment/stripe_stripe`. |

Set in the image (not variables): `HOST=::`, `MEDUSA_DISABLE_TELEMETRY=true`.

### Worker
- Source: same repo and root as Backend (`/services/backend`); `DISABLE_MEDUSA_ADMIN=true` is also a build argument, so the admin dashboard is not built.
- Start command: image `CMD`; in worker mode `start.sh` first waits for `MEDUSA_SERVER_HEALTH_URL` (Backend health over the private network, so migrations are done), then runs `medusa start`.
- Pre-deploy: none (migrations belong to the Backend only).
- Healthcheck: `/health` (Medusa also exposes it in worker mode), timeout 900 s. Public domain: none. TCP proxy: none. Volume: none.
- Restart policy: ON_FAILURE (10). Replicas: 1, scale with `numReplicas` (stateless). Cron: none (Medusa scheduled jobs run inside the worker, coordinated through Redis).

| Variable | Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Run Medusa in production mode. |
| `PORT` | `9000` | Port of the worker's internal /health endpoint. |
| `MEDUSA_WORKER_MODE` | `worker` | Subscribers, scheduled jobs, workflows and search indexing; no public HTTP. |
| `DISABLE_MEDUSA_ADMIN` | `true` | The worker does not build or serve the admin dashboard. |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Postgres over the private network. |
| `REDIS_URL` | `${{Redis.REDIS_URL}}?family=0` | Same Redis as the Backend. |
| `JWT_SECRET` / `COOKIE_SECRET` | `${{Backend.JWT_SECRET}}` / `${{Backend.COOKIE_SECRET}}` | Same secrets as the Backend. |
| `MEDUSA_BACKEND_URL` | `${{Backend.MEDUSA_BACKEND_URL}}` | Public backend URL, for links generated by background jobs. |
| `MEDUSA_SERVER_HEALTH_URL` | `http://${{Backend.RAILWAY_PRIVATE_DOMAIN}}:${{Backend.PORT}}/health` | The worker waits for this before starting. |
| `WAIT_FOR_SERVER_TIMEOUT_SECONDS` | `840` | Maximum wait before starting anyway. |
| `S3_FILE_URL` | `${{Backend.S3_FILE_URL}}` | Same public file URL as the Backend. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | `${{Bucket.*}}` | Same Bucket credentials as the Backend. |
| `S3_FORCE_PATH_STYLE` | `${{Backend.S3_FORCE_PATH_STYLE}}` | Same URL style as the Backend. |
| `MEILISEARCH_HOST` / `MEILISEARCH_API_KEY` | `${{Backend.MEILISEARCH_HOST}}` / `${{Backend.MEILISEARCH_API_KEY}}` | Same search engine (indexing runs here). |
| `STRIPE_API_KEY` / `STRIPE_WEBHOOK_SECRET` | `${{Backend.STRIPE_API_KEY}}` / `${{Backend.STRIPE_WEBHOOK_SECRET}}` | Same optional Stripe configuration. |

### Storefront
- Source: repo `baranberkay96/medusa-railway`, root `/services/storefront` (Dockerfile: downloads `medusajs/dtc-starter` at the pinned commit, adds `/api/health`, builds with placeholders).
- Start command: image `CMD` (`node /app/railway/start.mjs` → fetch key, apply runtime values, `next start -H :: -p 8000`).
- Pre-deploy: none. Healthcheck: `/api/health`, timeout 900 s (covers waiting for the Backend on first deploy). Public domain: yes, target port 8000. TCP proxy: none. Volume: none.
- Restart policy: ON_FAILURE (10). Replicas: 1 (stateless). Cron: none.

| Variable | Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Run Next.js in production mode. |
| `PORT` | `8000` | HTTP port of the Next.js server. |
| `NEXT_PUBLIC_MEDUSA_BACKEND_URL` | `https://${{Backend.RAILWAY_PUBLIC_DOMAIN}}` | Public backend URL used by the browser and the server (applied at container start). |
| `NEXT_PUBLIC_BASE_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | Public URL of this storefront. |
| `NEXT_PUBLIC_DEFAULT_REGION` | `dk` | Fallback country code; must belong to a Medusa region (demo region: gb, de, dk, se, fr, es, it). |
| `MEDUSA_INTERNAL_URL` | `http://${{Backend.RAILWAY_PRIVATE_DOMAIN}}:${{Backend.PORT}}` | Backend on the private network, used only at start to fetch the key. |
| `STOREFRONT_BOOTSTRAP_TOKEN` | `${{Backend.STOREFRONT_BOOTSTRAP_TOKEN}}` | Token for the Backend's /internal/publishable-key route. |
| `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` | empty (optional) | Manual override (`pk_...`); empty = fetch automatically. |
| `KEY_WAIT_TIMEOUT_SECONDS` | `840` | Maximum wait for the Backend at start before exiting (Railway restarts it). |
| `NEXT_PUBLIC_STRIPE_KEY` | empty (optional) | Stripe publishable key; build-time value, redeploy after changing it. |

### Media-Proxy
- Source: repo `baranberkay96/medusa-railway`, root `/services/media-proxy` (`oven/bun:1.4.2-alpine` + own `server.ts`, no dependencies).
- Start command: image `CMD` (`bun run server.ts`, listening on `::`). Pre-deploy: none.
- Healthcheck: `/health`, timeout 60 s. Public domain: yes, target port 8080. TCP proxy: none. Volume: none.
- Restart policy: ON_FAILURE (10). Replicas: 1 (stateless). Cron: none.
- Behaviour: GET/HEAD `/<object key>` streams the object from the Bucket; only content types in `ALLOWED_CONTENT_TYPES` are served (others return 404, so exports or imports stored in the same bucket stay private); ETag/304, byte ranges (206), long cache headers, `nosniff` and a sandboxing CSP for directly opened SVGs.

| Variable | Value | Description |
|---|---|---|
| `PORT` | `8080` | HTTP port of the proxy. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | `${{Bucket.*}}` | Read access to the Railway Bucket. |
| `S3_FORCE_PATH_STYLE` | `${{Backend.S3_FORCE_PATH_STYLE}}` | Same URL style as the Backend. |
| `CACHE_CONTROL` | `public, max-age=31536000, immutable` | Cache header for served files (Medusa file keys are unique per upload). |
| `ALLOWED_CONTENT_TYPES` | `image/,video/` | Content-type prefixes the proxy serves. |

### Meilisearch
- Source: image `getmeili/meilisearch:v1.54.3`. Start command: image default. Pre-deploy: none.
- Healthcheck: `/health`, timeout 120 s. Public domain: none (only the Backend and Worker talk to it). TCP proxy: none.
- Volume: `/meili_data`. Restart policy: ON_FAILURE (10). Replicas: 1 (has a volume). Cron: none.

| Variable | Value | Description |
|---|---|---|
| `PORT` | `7700` | Port used by the healthcheck and by the Backend URL. |
| `MEILI_HTTP_ADDR` | `[::]:7700` | Listen on IPv4 and IPv6 for the private network. |
| `MEILI_MASTER_KEY` | `${{secret(48, "<alphanumeric>")}}` | Master key protecting the API (generated). |
| `MEILI_ENV` | `production` | Requires the master key and disables the preview UI. |
| `MEILI_DB_PATH` | `/meili_data/data.ms` | Index storage on the volume. |
| `MEILI_DUMP_DIR` | `/meili_data/dumps` | Dumps on the volume. |
| `MEILI_NO_ANALYTICS` | `true` | Disable telemetry. |
| `MEILI_MAX_INDEXING_MEMORY` | `1GiB` | Bounds indexing memory so the container stays within budget. |

### Postgres
Railway base definition, unchanged (`templates/_railway-base/postgres.json`): image `ghcr.io/railwayapp-templates/postgres-ssl:18`, volume `/var/lib/postgresql/data`, no public domain, no TCP proxy, variables `PGDATA`, `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGPASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `POSTGRES_USER`, `SSL_CERT_DAYS`, `POSTGRES_PASSWORD` (generated), `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` with the base descriptions (see `template.json`).

### Redis
Railway base definition, unchanged (`templates/_railway-base/redis.json`): image `redis:8.2`, password-protected start command with persistence (`--save 60 1`), volume `/data`, no public domain, no TCP proxy, variables `REDISHOST`, `REDISPORT`, `REDISUSER`, `REDIS_URL`, `REDISPASSWORD`, `REDIS_PASSWORD` (generated).

### Bucket
Railway Bucket named `Bucket` (S3-compatible, private). Provides `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`, `ENDPOINT`, referenced by Backend, Worker and Media-Proxy. Holds product images and other uploads; Medusa writes with ACL headers disabled (`acl: false`) because Buckets have no public ACLs.

## Improvements over market templates

1. Builds from the official, MIT-licensed `medusajs/dtc-starter` (Medusa 2.21.2, Next.js 15) at a pinned commit instead of a community boilerplate tracking a branch.
2. Separate Worker service (`MEDUSA_WORKER_MODE=worker`, no admin build, scalable) as recommended by Medusa's deployment guide; the Backend runs in `server` mode only. The market leader runs everything in one process.
3. Migrations run in a Railway pre-deploy step (`medusa db:migrate`) instead of at container start; the Worker waits for the Backend's health before starting.
4. Storefront no longer needs a running backend at build time: placeholders are replaced at container start and the publishable key is fetched over the private network with a shared token. No manual key copying and no build-order race.
5. Idempotent admin bootstrap: the first admin user is created from generated credentials once and never overwritten; a missing publishable key is recreated and linked to the default sales channel.
6. Search goes through Medusa's own Search Module (`POST /store/search`), with Meilisearch as a private engine via a maintained, MIT-licensed provider (`@rokmohar/medusa-plugin-meilisearch` 2.3.1, built for Medusa 2.21). Meilisearch has no public domain and its master key never reaches the browser; the market leader exposed both. Built-in PostgreSQL search is a one-variable fallback.
7. Production Redis modules from Medusa's deployment guide (caching, event bus, workflow engine, locking) on one private Redis, with `family=0` for IPv4/IPv6 private DNS.
8. Own Media-Proxy with a content-type allowlist (images/video only), ETag/304, range requests and safe headers. The market proxy served any object in the bucket, including exports.
9. CORS values use the real public domains only (market templates listed private domains), and secrets are generated with `secret()` (the v1 template shipped `supersecret`).
10. Railway base Postgres 18 and Redis 8.2 definitions; no TCP proxies on databases (the market leader exposed Postgres and Redis publicly).
11. All images and package versions pinned (market templates used `postgres-ssl:latest` and unpinned Redis), servers listen on `::`, every HTTP service has a healthcheck.
12. Optional Stripe works out of the box on Backend, Worker and Storefront once keys are added; no keys are required to boot.

## Resource estimate

Estimates for a small store (a few hundred products, light traffic); not measured on Railway.

| Service | Idle RAM | Typical RAM | Typical vCPU | Volume |
|---|---|---|---|---|
| Backend | 450 MB | 900 MB | 0.30 | — |
| Worker | 350 MB | 700 MB | 0.20 | — |
| Storefront | 180 MB | 400 MB | 0.15 | — |
| Media-Proxy | 40 MB | 80 MB | 0.02 | — |
| Meilisearch | 80 MB | 300 MB | 0.05 | 1 GB |
| Postgres | 80 MB | 300 MB | 0.10 | 2 GB |
| Redis | 15 MB | 50 MB | 0.02 | 0.5 GB |
| **Total** | **~1.2 GB** | **~2.7 GB** | **~0.84** (idle ~0.09) | **3.5 GB** |

Monthly cost at Railway prices (RAM $10/GB-month, vCPU $20/vCPU-month, volume $0.15/GB-month, Bucket $0.015/GB-month), assuming 2 GB in the Bucket:

- **Idle:** 1.2 GB × $10 + 0.09 vCPU × $20 + 3.5 GB × $0.15 + 2 GB × $0.015 ≈ $12.00 + $1.80 + $0.53 + $0.03 ≈ **$14/month**
- **Typical:** 2.7 GB × $10 + 0.84 vCPU × $20 + $0.53 + $0.03 ≈ $27.30 + $16.80 + $0.56 ≈ **$45/month**
- Each extra Worker replica adds about 0.7 GB and 0.2 vCPU (≈ $11/month at typical load). Network egress is not included.

Minimum plan: **Hobby**. Trial's 1 GB RAM per service is below Medusa's recommended memory for the Backend during imports and admin use and will likely run out of memory under load. Hobby (up to 48 GB RAM and 5 GB volume per service) fits comfortably; use Pro for larger catalogues, more replicas or bigger volumes.

## Verification checklist

1. Backend: `https://<backend>/health` returns `OK`; pre-deploy log shows migrations and `[bootstrap] Created admin user ...`.
2. Admin: open `https://<backend>/app`, log in with `MEDUSA_ADMIN_EMAIL` / `MEDUSA_ADMIN_PASSWORD` from the Backend variables, then change the password.
3. Storefront: logs show `Received the publishable API key` and `Applied runtime config ... publishable key xN` with N ≥ 1; `https://<storefront>/api/health` returns `{"status":"ok"}`; `/` redirects to `/dk` and shows the demo products.
4. Search: the storefront search returns "shirt" results; Worker logs show the index being seeded; Meilisearch health is green.
5. Files: upload a product image in the admin; its URL starts with `https://<media-proxy>/` and loads; `curl -I` shows `Content-Type: image/...` and the cache header. A non-image key through the proxy returns 404.
6. Background work: place a test order with the system payment provider; it appears in the admin and the Worker logs process the order events.
7. Persistence: redeploy Postgres, Redis, Meilisearch, Backend and Worker; products, images, search results and the admin user remain (bootstrap logs `already exists`).
8. Scaling: set Worker replicas to 2 and Backend replicas to 2; all instances healthy and admin login still works (sessions in Redis).
9. Fallback: clear `MEILISEARCH_HOST` on Backend and Worker and redeploy; search still works on the built-in PostgreSQL provider.

## Open questions

- The Docker images were not built here (no package installs allowed). The overlay TypeScript was checked for syntax and against the `@medusajs/types` 2.21.2 declarations by reading; `medusa build` fails on type errors, so the first build is the real test.
- The runtime runs `medusa start` from `.medusa/server` with dependencies resolved from the parent `apps/backend/node_modules` (pnpm, frozen lockfile). Medusa's guide instead runs `npm install` inside `.medusa/server`; behaviour should match but is unverified.
- The Meilisearch plugin is added with `pnpm add` at build time, so its own transitive dependencies (`meilisearch ^0.62.0`) resolve within their ranges rather than from the starter's lockfile.
- The plugin advertises drop-in support for `POST /store/search`; compatibility with the starter's custom product index (price stats facets, `match_strategy: "last"`) is unverified. Fallback: clear `MEILISEARCH_HOST`.
- Placeholder replacement relies on Next.js inlining `NEXT_PUBLIC_*` values as literal strings; the replacement logic was tested locally on sample files, not on a real build. The start log reports replacement counts.
- Admin product CSV import uploads through presigned URLs directly to the Bucket; whether Railway Buckets accept browser CORS for that flow is unverified.
- Assumed: Railway pre-deploy commands reach the private network (migrations need Postgres and Meilisearch).
- Server-side storefront requests use the Backend's public URL because the starter shares one URL between browser and server; this adds a little latency and egress.
- Postgres 18 is newer than the PostgreSQL 15+ the starter documents; expected to work, not tested.
- Medusa RBAC and SSO are Enterprise Edition features under a commercial license; the template does not enable them (the bootstrap only reads the RBAC flag, as Medusa's own `medusa user` command does).
- `REVALIDATE_SECRET` from the older Next.js starter is not used by the current starter and is not included.
