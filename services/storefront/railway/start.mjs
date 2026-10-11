// Container start script for the Medusa Next.js storefront on Railway.
// Written for this template.
//
// Next.js inlines NEXT_PUBLIC_* values into the build output at build time.
// The publishable API key only exists after the Backend has migrated its
// database, and Railway builds cannot reach the private network, so the image
// is built with placeholder values (see Dockerfile). At container start this
// script:
//   1. resolves the real values; the publishable key is fetched from the
//      Backend over the private network (GET /internal/publishable-key),
//   2. copies the pristine build (.next-template) to .next and replaces the
//      placeholders with the real values,
//   3. starts `next start` on [::]:$PORT and forwards termination signals.
import { spawn } from "node:child_process"
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, extname, join } from "node:path"

// Must match the ENV placeholders in the Dockerfile build stage.
const PLACEHOLDERS = Object.freeze({
  backendUrl: "https://medusa-backend-url.placeholder.invalid",
  baseUrl: "https://storefront-base-url.placeholder.invalid",
  publishableKey: "pk_placeholder_runtime_publishable_key",
  defaultRegion: "placeholderdefaultregion",
})

const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".json", ".html", ".rsc", ".txt", ".body", ".meta", ".map"])
const SAFE_VALUE = /^[^\s"'`\\<>]+$/
const KEY_PATTERN = /^pk_[A-Za-z0-9]+$/
const REGION_PATTERN = /^[a-z]{2}$/
const LISTEN_HOST = "::"
const POLL_INTERVAL_MS = 5000
const REQUEST_TIMEOUT_MS = 5000

const appDir = process.cwd()
const templateDir = join(appDir, ".next-template")
const buildDir = join(appDir, ".next")

const log = (message) => console.log(`[storefront-start] ${message}`)
const fail = (message) => {
  console.error(`[storefront-start] ERROR: ${message}`)
  process.exit(1)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const errorMessage = (error) => (error instanceof Error ? error.message : String(error))

/** Trimmed env value, or the fallback when unset or blank. */
const readEnv = (name, fallback = undefined) => {
  const value = process.env[name]?.trim()
  return value ? value : fallback
}

const requireUrl = (name, value) => {
  if (!value) fail(`${name} is required.`)
  let url
  try {
    url = new URL(value)
  } catch {
    fail(`${name} is not a valid URL: ${value}`)
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") fail(`${name} must be an http(s) URL.`)
  const normalized = value.replace(/\/+$/, "")
  if (!SAFE_VALUE.test(normalized)) fail(`${name} contains unsupported characters.`)
  return normalized
}

const readConfig = () => {
  const backendUrl = requireUrl("NEXT_PUBLIC_MEDUSA_BACKEND_URL", readEnv("NEXT_PUBLIC_MEDUSA_BACKEND_URL"))
  const defaultRegion = readEnv("NEXT_PUBLIC_DEFAULT_REGION", "dk").toLowerCase()
  if (!REGION_PATTERN.test(defaultRegion)) fail("NEXT_PUBLIC_DEFAULT_REGION must be a two-letter country code.")
  const waitSeconds = Number.parseInt(readEnv("KEY_WAIT_TIMEOUT_SECONDS", "840"), 10)
  if (!Number.isFinite(waitSeconds) || waitSeconds < 0) fail("KEY_WAIT_TIMEOUT_SECONDS must be a positive number.")

  return Object.freeze({
    backendUrl,
    baseUrl: requireUrl("NEXT_PUBLIC_BASE_URL", readEnv("NEXT_PUBLIC_BASE_URL")),
    internalUrl: requireUrl("MEDUSA_INTERNAL_URL", readEnv("MEDUSA_INTERNAL_URL", backendUrl)),
    defaultRegion,
    bootstrapToken: readEnv("STOREFRONT_BOOTSTRAP_TOKEN"),
    keyOverride: readEnv("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY"),
    waitSeconds,
    port: readEnv("PORT", "8000"),
  })
}

const requestKey = async (endpoint, token) => {
  const response = await fetch(endpoint, {
    headers: { "x-bootstrap-token": token },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (response.status === 401 || response.status === 404) {
    fail(
      `Backend refused the key request (${response.status}). STOREFRONT_BOOTSTRAP_TOKEN must be ` +
        "set on the Backend and referenced by the Storefront."
    )
  }
  if (!response.ok) return { retry: `Backend answered ${response.status}` }
  const body = await response.json()
  const key = body?.publishable_key
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) fail("Backend returned an unexpected payload.")
  return { key }
}

const resolvePublishableKey = async (config) => {
  if (config.keyOverride) {
    if (!KEY_PATTERN.test(config.keyOverride)) fail("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY must look like pk_...")
    log("Using NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY from the environment.")
    return config.keyOverride
  }
  if (!config.bootstrapToken) {
    fail("Set STOREFRONT_BOOTSTRAP_TOKEN (shared with the Backend) or NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY.")
  }

  const endpoint = `${config.internalUrl}/internal/publishable-key`
  const deadline = Date.now() + config.waitSeconds * 1000
  log(`Fetching the publishable API key from ${endpoint}`)

  while (Date.now() < deadline) {
    try {
      const result = await requestKey(endpoint, config.bootstrapToken)
      if (result.key) {
        log("Received the publishable API key.")
        return result.key
      }
      log(`${result.retry}; retrying`)
    } catch (error) {
      log(`Backend not reachable yet (${errorMessage(error)}); retrying`)
    }
    await sleep(POLL_INTERVAL_MS)
  }
  return fail(`No publishable API key after ${config.waitSeconds}s. Is the Backend service healthy?`)
}

const listFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listFiles(path)
    return entry.isFile() ? [path] : []
  })

const replaceAll = (text, pairs) =>
  pairs.reduce(
    (state, [from, to]) => {
      const parts = state.text.split(from)
      return {
        text: parts.join(to),
        hits: { ...state.hits, [from]: (state.hits[from] ?? 0) + parts.length - 1 },
      }
    },
    { text, hits: {} }
  )

const prepareBuild = (config, publishableKey) => {
  rmSync(buildDir, { recursive: true, force: true })
  cpSync(templateDir, buildDir, { recursive: true })

  // Full URLs first, then bare hostnames as a safety net.
  const pairs = [
    [PLACEHOLDERS.backendUrl, config.backendUrl],
    [PLACEHOLDERS.baseUrl, config.baseUrl],
    [new URL(PLACEHOLDERS.backendUrl).host, new URL(config.backendUrl).host],
    [new URL(PLACEHOLDERS.baseUrl).host, new URL(config.baseUrl).host],
    [PLACEHOLDERS.publishableKey, publishableKey],
    [PLACEHOLDERS.defaultRegion, config.defaultRegion],
  ]

  const totals = listFiles(buildDir)
    .filter((file) => TEXT_EXTENSIONS.has(extname(file)))
    .reduce((acc, file) => {
      const original = readFileSync(file, "utf8")
      if (!pairs.some(([from]) => original.includes(from))) return acc
      const { text, hits } = replaceAll(original, pairs)
      writeFileSync(file, text)
      return Object.fromEntries(pairs.map(([from]) => [from, (acc[from] ?? 0) + (hits[from] ?? 0)]))
    }, {})

  log(
    `Applied runtime config: backend URL x${totals[PLACEHOLDERS.backendUrl] ?? 0}, ` +
      `base URL x${totals[PLACEHOLDERS.baseUrl] ?? 0}, publishable key x${totals[PLACEHOLDERS.publishableKey] ?? 0}, ` +
      `default region x${totals[PLACEHOLDERS.defaultRegion] ?? 0}.`
  )
  if (!totals[PLACEHOLDERS.publishableKey]) {
    log("WARNING: no publishable-key placeholder found in the build output. Check the Dockerfile placeholders.")
  }
}

const nextBinary = () => {
  const require = createRequire(join(appDir, "package.json"))
  const packageJsonPath = require.resolve("next/package.json")
  const { bin } = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  return join(dirname(packageJsonPath), typeof bin === "string" ? bin : bin.next)
}

const startNext = (config, publishableKey) => {
  const child = spawn(process.execPath, [nextBinary(), "start", "-H", LISTEN_HOST, "-p", config.port], {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_MEDUSA_BACKEND_URL: config.backendUrl,
      NEXT_PUBLIC_BASE_URL: config.baseUrl,
      NEXT_PUBLIC_DEFAULT_REGION: config.defaultRegion,
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: publishableKey,
    },
  })
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => child.kill(signal))
  }
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
}

const config = readConfig()
const publishableKey = await resolvePublishableKey(config)
prepareBuild(config, publishableKey)
startNext(config, publishableKey)
