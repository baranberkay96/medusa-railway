// Liveness endpoint for Railway healthchecks (written for this template).
// /api/* is excluded from the storefront middleware, so this answers without
// calling the Medusa backend. The server only starts listening after the
// start script has obtained the publishable key, so a 200 here also means
// the storefront is configured.
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export function GET(): NextResponse {
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } })
}
