# Notice

## Upstream software

| Component | License | How it is used |
|---|---|---|
| Medusa (`medusajs/medusa`, npm `@medusajs/*`) | MIT, except Enterprise Edition materials listed in its `ENTERPRISE-LICENSE.md` (not enabled by this template) | Installed from npm at image build time |
| Medusa DTC starter (`medusajs/dtc-starter`) | MIT, Copyright (c) 2022 Medusa | Downloaded at image build time from a pinned commit; not redistributed in this repository |
| `@rokmohar/medusa-plugin-meilisearch` | MIT (npm metadata) | Installed from npm at image build time (2.3.1) |
| Next.js | MIT | Dependency of the starter storefront |
| Meilisearch | MIT for the Community Edition; Enterprise Edition parts under BUSL-1.1 (not used) | Official image `getmeili/meilisearch` |
| Bun | MIT (statically links JavaScriptCore/WebKit under LGPL-2) | Official image `oven/bun` for Media-Proxy |
| Node.js | MIT | Official image `node` (bookworm-slim) |
| PostgreSQL / Redis | PostgreSQL License / RSALv2, SSPLv1 or AGPLv3 (Redis 8) | Railway base images |

## Verified against

| What | Source | Ref | Checked |
|---|---|---|---|
| Current Medusa release | https://github.com/medusajs/medusa/releases | v2.21.2 | 2026-10-10 |
| Starter backend/storefront, package versions, lockfile, migration script | https://github.com/medusajs/dtc-starter | commit `f677db438f27294fc50e4c7c6612e71ff38eeff5` | 2026-10-10 |
| Worker mode, deployment, S3 file provider, Redis modules | https://docs.medusajs.com (deployment and infrastructure module guides) | Medusa 2.21 | 2026-10-10 |
| Meilisearch plugin compatibility | npm `@rokmohar/medusa-plugin-meilisearch` 2.3.1 and its repository README | 2.3.1 | 2026-10-10 |
| Meilisearch image and upgrade notes | Docker Hub `getmeili/meilisearch`, Meilisearch docs | v1.54.3 | 2026-10-10 |
| Railway Bucket behaviour (private, S3 API, virtual-hosted) | https://docs.railway.com/guides/storage-buckets | — | 2026-10-10 |
| Licenses | GitHub license API / LICENSE files of the repositories above | — | 2026-10-11 |

## Adapted code

None. All files in `services/` (Dockerfiles, `overlay/medusa-config.ts`, `overlay/src/scripts/railway-bootstrap.ts`, `overlay/src/api/internal/publishable-key/route.ts`, the storefront `start.mjs` and health route, the start/pre-deploy scripts and `media-proxy/server.ts`) were written for this template. The starter's own source is fetched at build time from `medusajs/dtc-starter` (MIT) and only overlaid, not copied into this repository.

## Reference only (not copied)

- `rpuls/medusajs-2.0-for-railway-boilerplate` (market template `gkU-27`): its LICENSE is MIT text with an added attribution paragraph (GitHub reports NOASSERTION). Read for ideas only (runtime publishable-key exchange, Meilisearch plugin choice); no files or text copied.
- `medusajs/medusa-starter-default` (in `_upstream`): no LICENSE file in the repository (package.json declares MIT); superseded by `dtc-starter`; read only.
- Market templates `zC7eOq` and `Fb6KUX`: configuration only, nothing copied.

## Trademarks

Medusa is a trademark of MedusaJS, Inc. Meilisearch is a trademark of Meili SAS. Next.js is a trademark of Vercel, Inc. This is a community template and is not affiliated with or endorsed by these companies.
