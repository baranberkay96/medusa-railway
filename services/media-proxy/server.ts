/**
 * Media-Proxy: read-only public gateway for a private Railway Bucket.
 * Written for this template.
 *
 * Railway Buckets have no public access, so Medusa's S3 file provider uses
 * this service's public URL as `file_url`: an uploaded object with key K is
 * served at GET https://<media-proxy-domain>/<K>.
 *
 * - GET/HEAD only, /health for Railway healthchecks.
 * - Serves only content types listed in ALLOWED_CONTENT_TYPES (default:
 *   images and video), so other objects in the bucket (for example product
 *   export CSVs) are not exposed through this public URL.
 * - Supports ETag/If-None-Match (304) and single byte ranges (206).
 * - Uses Bun's built-in S3 client; no third-party dependencies.
 */
import { S3Client } from "bun"

type ByteRange = { start: number; end: number }

const readEnv = (name: string, fallback?: string): string => {
  const value = Bun.env[name]?.trim()
  if (value) return value
  if (fallback !== undefined) return fallback
  throw new Error(`Missing required environment variable ${name}`)
}

const PORT = Number.parseInt(readEnv("PORT", "8080"), 10)
const CACHE_CONTROL = readEnv("CACHE_CONTROL", "public, max-age=31536000, immutable")
const ALLOWED_TYPES = readEnv("ALLOWED_CONTENT_TYPES", "image/,video/")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean)
const MAX_KEY_LENGTH = 1024
const BUCKET = readEnv("S3_BUCKET")

const client = new S3Client({
  accessKeyId: readEnv("S3_ACCESS_KEY_ID"),
  secretAccessKey: readEnv("S3_SECRET_ACCESS_KEY"),
  bucket: BUCKET,
  endpoint: readEnv("S3_ENDPOINT"),
  region: readEnv("S3_REGION", "auto"),
  virtualHostedStyle: readEnv("S3_FORCE_PATH_STYLE", "false").toLowerCase() !== "true",
})

const BASE_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  // Blocks scripts if someone opens an uploaded SVG directly.
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "Access-Control-Allow-Origin": "*",
}

const plain = (status: number, body: string, extra: Record<string, string> = {}): Response =>
  new Response(body, {
    status,
    headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8", ...extra },
  })

const objectKey = (pathname: string): string | null => {
  let key: string
  try {
    key = decodeURIComponent(pathname.slice(1))
  } catch {
    return null
  }
  if (!key || key.length > MAX_KEY_LENGTH || key.includes("\0") || key.endsWith("/")) return null
  if (key.split("/").some((segment) => segment === "." || segment === "..")) return null
  return key
}

const isAllowedType = (contentType: string): boolean => {
  const type = contentType.toLowerCase()
  return ALLOWED_TYPES.includes("*") || ALLOWED_TYPES.some((prefix) => type.startsWith(prefix))
}

/** Parses a single "bytes=" range. null = no range header, "invalid" = 416. */
const byteRange = (header: string | null, size: number): ByteRange | "invalid" | null => {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === "" && match[2] === "")) return "invalid"

  const range: ByteRange =
    match[1] === ""
      ? { start: Math.max(size - Number(match[2]), 0), end: size - 1 }
      : { start: Number(match[1]), end: match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1) }

  return range.start > range.end || range.start >= size ? "invalid" : range
}

const isNotFound = (error: unknown): boolean => {
  const { code, name, message } = (error ?? {}) as { code?: string; name?: string; message?: string }
  return [code, name, message].some((value) => typeof value === "string" && /NoSuchKey|NotFound|404/.test(value))
}

async function serveObject(req: Request, key: string): Promise<Response> {
  const file = client.file(key)

  let stat: Awaited<ReturnType<typeof file.stat>>
  try {
    stat = await file.stat()
  } catch (error: unknown) {
    if (isNotFound(error)) return plain(404, "Not Found")
    console.error(`[media-proxy] stat failed for "${key}":`, error)
    return plain(502, "Bad Gateway")
  }

  const contentType = stat.type || "application/octet-stream"
  // Same answer as a missing object: do not reveal what else is stored.
  if (!isAllowedType(contentType)) return plain(404, "Not Found")

  const headers: Record<string, string> = {
    ...BASE_HEADERS,
    "Content-Type": contentType,
    "Cache-Control": CACHE_CONTROL,
    "Accept-Ranges": "bytes",
    ...(stat.etag ? { ETag: stat.etag } : {}),
    ...(stat.lastModified ? { "Last-Modified": new Date(stat.lastModified).toUTCString() } : {}),
  }

  const ifNoneMatch = req.headers.get("if-none-match")
  if (stat.etag && ifNoneMatch?.split(",").some((tag) => tag.trim() === stat.etag)) {
    return new Response(null, { status: 304, headers })
  }

  const range = byteRange(req.headers.get("range"), stat.size)
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${stat.size}` } })
  }

  const isHead = req.method === "HEAD"
  if (range) {
    return new Response(isHead ? null : file.slice(range.start, range.end + 1).stream(), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
        "Content-Length": String(range.end - range.start + 1),
      },
    })
  }

  return new Response(isHead ? null : file.stream(), {
    status: 200,
    headers: { ...headers, "Content-Length": String(stat.size) },
  })
}

const server = Bun.serve({
  hostname: "::",
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const { pathname } = new URL(req.url)

    if (pathname === "/health") return Response.json({ status: "ok" })
    if (req.method !== "GET" && req.method !== "HEAD") {
      return plain(405, "Method Not Allowed", { Allow: "GET, HEAD" })
    }

    const key = objectKey(pathname)
    return key ? serveObject(req, key) : plain(404, "Not Found")
  },
  error(error: Error): Response {
    console.error("[media-proxy] unhandled error:", error)
    return plain(500, "Internal Server Error")
  },
})

console.info(`[media-proxy] listening on [${server.hostname}]:${server.port} for bucket ${BUCKET}`)
