/**
 * GET /internal/publishable-key
 *
 * Hands the Storefront service its publishable API key when its container
 * starts, so the key never has to be copied by hand and is not needed at
 * image build time (Railway builds have no private network access).
 *
 * - Disabled (404) unless STOREFRONT_BOOTSTRAP_TOKEN is set on this service.
 * - Requires that token in the `x-bootstrap-token` header (constant-time
 *   comparison). Publishable keys are public by design, they ship in the
 *   browser bundle, so the token only keeps this from being an open lookup.
 * - Never returns secret API keys: it only lists keys of type "publishable".
 *
 * Written for this Railway template.
 */
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createHash, timingSafeEqual } from "node:crypto"

const DEFAULT_KEY_TITLE = "Default Publishable API Key"
const MIN_TOKEN_LENGTH = 24

interface PublishableKeyRecord {
  token: string
  title?: string | null
  revoked_at?: Date | string | null
  created_at?: Date | string | null
}

interface ApiKeyLister {
  listApiKeys(filters: { type: "publishable" }): Promise<PublishableKeyRecord[]>
}

interface ErrorLogger {
  error(message: string): void
}

const digest = (value: string): Buffer => createHash("sha256").update(value, "utf8").digest()

const tokenMatches = (provided: unknown, expected: string): boolean =>
  typeof provided === "string" && timingSafeEqual(digest(provided), digest(expected))

const createdAt = (key: PublishableKeyRecord): number =>
  key.created_at ? new Date(key.created_at).getTime() : 0

/** Oldest active key with the preferred title, else the oldest active key. */
const pickKey = (
  keys: readonly PublishableKeyRecord[],
  preferredTitle: string
): PublishableKeyRecord | undefined => {
  const active = keys
    .filter((key) => Boolean(key.token) && !key.revoked_at)
    .sort((a, b) => createdAt(a) - createdAt(b))

  return active.find((key) => key.title === preferredTitle) ?? active[0]
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unexpected error"

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const expected = process.env.STOREFRONT_BOOTSTRAP_TOKEN?.trim()

  if (!expected || expected.length < MIN_TOKEN_LENGTH) {
    res.status(404).json({ message: "Not found" })
    return
  }

  if (!tokenMatches(req.headers["x-bootstrap-token"], expected)) {
    res.status(401).json({ message: "Unauthorized" })
    return
  }

  res.setHeader("Cache-Control", "no-store")

  try {
    const apiKeyModule = req.scope.resolve<ApiKeyLister>(Modules.API_KEY)
    const keys = await apiKeyModule.listApiKeys({ type: "publishable" })
    const preferredTitle =
      process.env.STOREFRONT_PUBLISHABLE_KEY_TITLE?.trim() || DEFAULT_KEY_TITLE
    const key = pickKey(keys, preferredTitle)

    if (!key) {
      res.status(503).json({
        message:
          "No active publishable API key exists yet. The first `medusa db:migrate` " +
          "creates one; otherwise create it in the admin under Settings > Publishable API Keys.",
      })
      return
    }

    res.status(200).json({ publishable_key: key.token })
  } catch (error: unknown) {
    // Log details server-side only; the response stays generic.
    req.scope
      .resolve<ErrorLogger>(ContainerRegistrationKeys.LOGGER)
      .error(`[internal/publishable-key] lookup failed: ${errorMessage(error)}`)
    res.status(500).json({ message: "Could not read the publishable API key." })
  }
}
