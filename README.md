# Deploy and Host Medusa with Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/medusa-v2-commerce-store-backend-storefr?referralCode=20H68q)

Launch a complete Medusa v2 store on Railway: the Medusa backend with its admin dashboard, a background worker, the official Next.js storefront, Meilisearch-powered search, Postgres, Redis and product images in a Railway Bucket. The admin user and the storefront's API key are set up automatically on the first deploy. Community template.

## About Hosting Medusa

Medusa is a headless commerce platform: a Node.js backend exposes Store and Admin APIs, and any frontend can sell through it. A production setup needs more than one process. Medusa recommends running the HTTP server and a separate worker for subscribers, scheduled jobs and workflows, both backed by Postgres and Redis, with uploads in object storage. This template builds the backend and storefront from the official `medusajs/dtc-starter` at a pinned commit, runs migrations in a pre-deploy step, stores files in a private Railway Bucket served through a small read-only media proxy, and hands the storefront its publishable key at start-up over the private network, so nothing has to be copied by hand.

## Common Use Cases

- Direct-to-consumer web shops with a custom Next.js storefront
- Headless commerce backend for mobile apps, marketplaces or B2B portals
- Multi-region stores with separate currencies, taxes and fulfilment settings
- Migration or proof of concept before moving off a hosted e-commerce platform
- Agencies building client stores on a reproducible, pinned stack

## Dependencies for Medusa Hosting

- Medusa 2.21 backend (server + worker) and Next.js 15 storefront from `medusajs/dtc-starter`
- Postgres 18 and Redis 8.2 (Railway base services)
- Meilisearch v1.54 with `@rokmohar/medusa-plugin-meilisearch`
- Railway Bucket for uploads, plus a Bun media proxy for public file URLs

### Deployment Dependencies

- Medusa deployment guide: https://docs.medusajs.com/learn/deployment/general
- Worker mode: https://docs.medusajs.com/learn/production/worker-mode
- S3 file provider: https://docs.medusajs.com/resources/infrastructure-modules/file/s3
- Official starter: https://github.com/medusajs/dtc-starter
- Meilisearch: https://www.meilisearch.com/docs
- Railway Buckets: https://docs.railway.com/guides/storage-buckets

### Implementation Details

| Service | Source | Purpose |
|---|---|---|
| Backend | `dtc-starter` apps/backend (Medusa 2.21.2) | Store/Admin API, admin at `/app`, runs migrations before each deploy (public) |
| Worker | same image, `MEDUSA_WORKER_MODE=worker` | Subscribers, scheduled jobs, workflows, search indexing (private, scalable) |
| Storefront | `dtc-starter` apps/storefront (Next.js 15) | Customer-facing shop (public) |
| Media-Proxy | `oven/bun:1.4.2-alpine` + template code | Serves images/videos from the private Bucket (public, read-only) |
| Meilisearch | `getmeili/meilisearch:v1.54.3` | Search engine, volume `/meili_data` (private) |
| Postgres | `postgres-ssl:18` | Database (private) |
| Redis | `redis:8.2` | Sessions, events, workflows, locking, cache (private) |

**First login**

1. Before deploying, set `MEDUSA_ADMIN_EMAIL` on the Backend to your address (default `admin@example.com`). No other input is needed.
2. Wait for the Backend pre-deploy (migrations + demo store) and for all services to turn healthy; the Storefront waits for the Backend on its first start.
3. Open `https://{backend-domain}/app` and log in with `MEDUSA_ADMIN_EMAIL` and the generated `MEDUSA_ADMIN_PASSWORD` from the Backend's Variables tab. Change the password.
4. Open the Storefront domain: the demo region and products are live. Add Stripe keys (`STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET` on the Backend, `NEXT_PUBLIC_STRIPE_KEY` on the Storefront) when you are ready to take payments.

**Scaling workers**: raise the Worker's replica count in Railway; it is stateless and coordinates through Redis. The Backend and Storefront are stateless too and can run more replicas. Meilisearch, Postgres and Redis keep one instance each (they own volumes).

**Search**: the storefront calls Medusa's `POST /store/search`; Meilisearch stays private and its key never reaches the browser. To fall back to Medusa's built-in Postgres search, clear `MEILISEARCH_HOST` on the Backend and Worker.

**Custom domains**: after adding domains, update `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS` and `MEDUSA_BACKEND_URL` on the Backend, `NEXT_PUBLIC_MEDUSA_BACKEND_URL` and `NEXT_PUBLIC_BASE_URL` on the Storefront, and `S3_FILE_URL` if the media proxy gets its own domain.

**Pinning and upgrades**: the starter commit (`DTC_STARTER_REF`) and the Meilisearch plugin version (`MEILISEARCH_PLUGIN_VERSION`) are build arguments in `services/backend/Dockerfile` and `services/storefront/Dockerfile`. Change them together, check the plugin's Medusa compatibility, and redeploy; migrations run automatically. Upgrade Meilisearch with a dump/snapshot first, following its upgrade guide.

### Why Deploy Medusa on Railway?

Railway runs the backend, worker, storefront and data services side by side on a private network, with pre-deploy migrations, generated secrets, volumes, a managed bucket and per-second billing. You get a production-shaped Medusa store from one deploy and can scale the API, workers and storefront independently as traffic grows.
