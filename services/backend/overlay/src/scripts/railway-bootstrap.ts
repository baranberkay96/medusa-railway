/**
 * Idempotent post-migration bootstrap, run by the Backend pre-deploy step:
 *
 *   medusa exec ./src/scripts/railway-bootstrap.js
 *
 * 1. Creates the first admin user from MEDUSA_ADMIN_EMAIL / MEDUSA_ADMIN_PASSWORD
 *    if no user with that email exists. An existing user is never modified, so
 *    changing the variables later does not reset a password.
 * 2. Makes sure an active publishable API key exists and is linked to the
 *    store's default sales channel. On a fresh database the starter's
 *    migration script already creates one; this only repairs stores where it
 *    was revoked or never created.
 *
 * Both steps are attempted; the script exits non-zero if either failed.
 * Written for this Railway template.
 */
import type { ExecArgs, Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, FeatureFlag, Modules } from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createUsersWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"

const PUBLISHABLE_KEY_TITLE = "Default Publishable API Key"
const MIN_PASSWORD_LENGTH = 12

interface UserLookup {
  listUsers(filters: { email: string }, config: { take: number }): Promise<Array<{ id: string }>>
  deleteUsers(ids: string[]): Promise<void>
}

interface AuthRegistrar {
  register(
    provider: string,
    input: { body: Record<string, string> }
  ): Promise<{ authIdentity?: { id: string }; error?: string }>
  updateAuthIdentities(data: { id: string; app_metadata: Record<string, unknown> }): Promise<unknown>
}

interface RoleLookup {
  listRbacRoles(filters: { id: string }): Promise<Array<{ id: string }>>
}

interface ApiKeyLookup {
  listApiKeys(filters: { type: "publishable" }): Promise<Array<{ revoked_at?: Date | null }>>
}

interface StoreLookup {
  listStores(
    filters: Record<string, never>,
    config: { take: number }
  ): Promise<Array<{ default_sales_channel_id?: string | null }>>
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

async function superAdminRoles(container: MedusaContainer): Promise<string[]> {
  if (!FeatureFlag.isFeatureEnabled("rbac")) {
    return []
  }
  const roles = await container
    .resolve<RoleLookup>(Modules.RBAC)
    .listRbacRoles({ id: "role_super_admin" })
  return roles.length > 0 ? [roles[0].id] : []
}

async function ensureAdminUser(container: MedusaContainer, logger: Logger): Promise<void> {
  const email = process.env.MEDUSA_ADMIN_EMAIL?.trim()
  const password = process.env.MEDUSA_ADMIN_PASSWORD ?? ""

  if (!email || !password) {
    logger.info("[bootstrap] MEDUSA_ADMIN_EMAIL or MEDUSA_ADMIN_PASSWORD is empty; skipping admin user.")
    return
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    logger.warn(`[bootstrap] MEDUSA_ADMIN_PASSWORD is shorter than ${MIN_PASSWORD_LENGTH} characters.`)
  }

  const userModule = container.resolve<UserLookup>(Modules.USER)
  const existing = await userModule.listUsers({ email }, { take: 1 })

  if (existing.length > 0) {
    logger.info(`[bootstrap] Admin user ${email} already exists; leaving it unchanged.`)
    return
  }

  const roles = await superAdminRoles(container)
  const { result: users } = await createUsersWorkflow(container).run({
    input: { users: [{ email, ...(roles.length > 0 ? { roles } : {}) }] },
  })
  const userId = users[0].id

  const authModule = container.resolve<AuthRegistrar>(Modules.AUTH)
  const { authIdentity, error } = await authModule.register("emailpass", {
    body: { email, password },
  })

  if (error || !authIdentity) {
    // Do not leave a user without credentials behind: the next run would
    // skip it and nobody could log in.
    await userModule.deleteUsers([userId])
    throw new Error(
      `Could not register credentials for ${email}: ${error ?? "no auth identity returned"}. ` +
        "If an identity with this email already exists, create the user with " +
        "`npx medusa user -e <email> -p <password>` from the Backend service shell."
    )
  }

  await authModule.updateAuthIdentities({
    id: authIdentity.id,
    app_metadata: { user_id: userId },
  })

  logger.info(`[bootstrap] Created admin user ${email}${roles.length > 0 ? " (super admin role)" : ""}.`)
}

async function ensurePublishableKey(container: MedusaContainer, logger: Logger): Promise<void> {
  const keys = await container
    .resolve<ApiKeyLookup>(Modules.API_KEY)
    .listApiKeys({ type: "publishable" })

  if (keys.some((key) => !key.revoked_at)) {
    logger.info("[bootstrap] An active publishable API key exists.")
    return
  }

  const [store] = await container
    .resolve<StoreLookup>(Modules.STORE)
    .listStores({}, { take: 1 })
  const salesChannelId = store?.default_sales_channel_id ?? undefined

  const {
    result: [apiKey],
  } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [{ title: PUBLISHABLE_KEY_TITLE, type: "publishable", created_by: "" }],
    },
  })

  if (!salesChannelId) {
    logger.warn(
      "[bootstrap] Created a publishable API key, but the store has no default sales channel. " +
        "Link the key to a sales channel in the admin, otherwise the storefront shows no products."
    )
    return
  }

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: apiKey.id, add: [salesChannelId] },
  })
  logger.info("[bootstrap] Created a publishable API key linked to the default sales channel.")
}

export default async function railwayBootstrap({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const steps: Array<[string, () => Promise<void>]> = [
    ["admin user", () => ensureAdminUser(container, logger)],
    ["publishable API key", () => ensurePublishableKey(container, logger)],
  ]

  const failures: string[] = []
  for (const [name, step] of steps) {
    try {
      await step()
    } catch (error: unknown) {
      logger.error(`[bootstrap] ${name} step failed: ${errorMessage(error)}`)
      failures.push(name)
    }
  }

  if (failures.length > 0) {
    throw new Error(`[bootstrap] Failed steps: ${failures.join(", ")}`)
  }
}
