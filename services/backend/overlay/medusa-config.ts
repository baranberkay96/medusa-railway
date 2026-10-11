/**
 * Medusa configuration for the Railway template (Backend and Worker services).
 *
 * Written for this template; replaces apps/backend/medusa-config.ts of the
 * pinned medusajs/dtc-starter commit at image build time. Every value comes
 * from environment variables, so the same image runs as the API server
 * (MEDUSA_WORKER_MODE=server) and as the background worker
 * (MEDUSA_WORKER_MODE=worker, DISABLE_MEDUSA_ADMIN=true).
 *
 * Nothing in this file may throw when variables are missing: `medusa build`
 * loads it at image build time, when only build arguments are available.
 */
import { defineConfig, loadEnv } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

type WorkerMode = "shared" | "worker" | "server"

const WORKER_MODES: readonly WorkerMode[] = ["shared", "worker", "server"]
const TRUE_VALUES = ["1", "true", "yes"]

/** Trimmed env value, or undefined when unset or blank. */
const env = (name: string): string | undefined => {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

const flag = (name: string, fallback = false): boolean => {
  const value = env(name)
  return value === undefined ? fallback : TRUE_VALUES.includes(value.toLowerCase())
}

const withoutTrailingSlash = (value?: string): string | undefined =>
  value?.replace(/\/+$/, "")

const workerMode: WorkerMode =
  WORKER_MODES.find((mode) => mode === env("MEDUSA_WORKER_MODE")) ?? "shared"

const BACKEND_URL = withoutTrailingSlash(env("MEDUSA_BACKEND_URL"))

// One Redis instance serves sessions, events, workflows, locking and caching.
const REDIS_URL = env("REDIS_URL")
const CACHE_REDIS_URL = env("CACHE_REDIS_URL") ?? REDIS_URL
const LOCKING_REDIS_URL = env("LOCKING_REDIS_URL") ?? REDIS_URL

// Railway Bucket (private, S3-compatible). Files are served publicly through
// the Media-Proxy service, whose public URL is S3_FILE_URL.
const S3 = {
  file_url: withoutTrailingSlash(env("S3_FILE_URL")),
  access_key_id: env("S3_ACCESS_KEY_ID"),
  secret_access_key: env("S3_SECRET_ACCESS_KEY"),
  region: env("S3_REGION") ?? "auto",
  bucket: env("S3_BUCKET"),
  endpoint: env("S3_ENDPOINT"),
  prefix: env("S3_PREFIX"),
  forcePathStyle: flag("S3_FORCE_PATH_STYLE"),
}
const S3_ENABLED = Boolean(
  S3.file_url && S3.access_key_id && S3.secret_access_key && S3.bucket && S3.endpoint
)

// Only warn at runtime (DATABASE_URL is not available during the image build).
if (!S3_ENABLED && env("DATABASE_URL")) {
  console.warn(
    "[medusa-config] S3 file storage is not fully configured (S3_FILE_URL, S3_BUCKET, " +
      "S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY). Falling back to local file " +
      "storage, which is lost on every redeploy."
  )
}

const MEILISEARCH_HOST = withoutTrailingSlash(env("MEILISEARCH_HOST"))
const MEILISEARCH_API_KEY = env("MEILISEARCH_API_KEY")

const STRIPE_API_KEY = env("STRIPE_API_KEY")
const STRIPE_WEBHOOK_SECRET = env("STRIPE_WEBHOOK_SECRET")

const redisModules = REDIS_URL
  ? [
      {
        resolve: "@medusajs/medusa/caching",
        options: {
          providers: [
            {
              resolve: "@medusajs/medusa/caching-redis",
              id: "caching-redis",
              is_default: true,
              options: { redisUrl: CACHE_REDIS_URL },
            },
          ],
        },
      },
      {
        resolve: "@medusajs/medusa/event-bus-redis",
        options: { redisUrl: REDIS_URL },
      },
      {
        resolve: "@medusajs/medusa/workflow-engine-redis",
        options: { redis: { redisUrl: REDIS_URL } },
      },
      {
        resolve: "@medusajs/medusa/locking",
        options: {
          providers: [
            {
              resolve: "@medusajs/medusa/locking-redis",
              id: "locking-redis",
              is_default: true,
              options: { redisUrl: LOCKING_REDIS_URL },
            },
          ],
        },
      },
    ]
  : []

const fileModule = {
  resolve: "@medusajs/medusa/file",
  options: {
    providers: [
      S3_ENABLED
        ? {
            resolve: "@medusajs/medusa/file-s3",
            id: "s3",
            options: {
              file_url: S3.file_url,
              access_key_id: S3.access_key_id,
              secret_access_key: S3.secret_access_key,
              region: S3.region,
              bucket: S3.bucket,
              endpoint: S3.endpoint,
              ...(S3.prefix ? { prefix: S3.prefix } : {}),
              // Railway Buckets are private and have no public ACLs: omit the
              // ACL header entirely and serve files through Media-Proxy.
              acl: false,
              additional_client_config: { forcePathStyle: S3.forcePathStyle },
            },
          }
        : {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              upload_dir: "static",
              backend_url: `${BACKEND_URL ?? "http://localhost:9000"}/static`,
            },
          },
    ],
  },
}

// Medusa's Search Module (v2.21.1+) is registered by default with its
// PostgreSQL provider. When Meilisearch is configured it becomes the engine
// behind the same module, so `POST /store/search` and the storefront's
// InstantSearch adapter keep working unchanged. Unset MEILISEARCH_HOST on
// Backend and Worker to fall back to the built-in PostgreSQL provider.
const searchModules =
  MEILISEARCH_HOST && MEILISEARCH_API_KEY
    ? [
        {
          resolve: "@medusajs/medusa/search",
          options: {
            providers: [
              {
                resolve: "@rokmohar/medusa-plugin-meilisearch/providers/meilisearch",
                id: "meilisearch",
                options: {
                  config: { host: MEILISEARCH_HOST, apiKey: MEILISEARCH_API_KEY },
                },
              },
            ],
          },
        },
      ]
    : []

const paymentModules = STRIPE_API_KEY
  ? [
      {
        resolve: "@medusajs/medusa/payment",
        options: {
          providers: [
            {
              resolve: "@medusajs/medusa/payment-stripe",
              id: "stripe",
              options: {
                apiKey: STRIPE_API_KEY,
                ...(STRIPE_WEBHOOK_SECRET ? { webhookSecret: STRIPE_WEBHOOK_SECRET } : {}),
              },
            },
          ],
        },
      },
    ]
  : []

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: env("DATABASE_URL"),
    ...(REDIS_URL ? { redisUrl: REDIS_URL } : {}),
    workerMode,
    http: {
      storeCors: env("STORE_CORS") ?? "http://localhost:8000",
      adminCors: env("ADMIN_CORS") ?? "http://localhost:9000",
      authCors: env("AUTH_CORS") ?? "http://localhost:8000,http://localhost:9000",
      jwtSecret: env("JWT_SECRET"),
      cookieSecret: env("COOKIE_SECRET"),
    },
  },
  admin: {
    disable: flag("DISABLE_MEDUSA_ADMIN"),
    // "/" = same origin. The dashboard is served by this service at /app, so
    // the image does not depend on the public domain at build time.
    backendUrl: BACKEND_URL ?? "/",
  },
  modules: [...redisModules, fileModule, ...searchModules, ...paymentModules],
})
