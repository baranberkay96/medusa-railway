// Usage: node wait-for-http.mjs <url> [timeoutSeconds]
// Polls <url> until it answers 2xx or the timeout passes. Exit 0 = ready, 1 = timed out.
const POLL_INTERVAL_MS = 5000
const REQUEST_TIMEOUT_MS = 5000

const [url, timeoutArg = "840"] = process.argv.slice(2)
const timeoutSeconds = Number.parseInt(timeoutArg, 10)

if (!url || !/^https?:\/\//.test(url) || !Number.isFinite(timeoutSeconds) || timeoutSeconds < 0) {
  console.error("[wait] usage: node wait-for-http.mjs <http(s)://url> [timeoutSeconds]")
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const deadline = Date.now() + timeoutSeconds * 1000

while (Date.now() < deadline) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (response.ok) {
      console.log(`[wait] ${url} is ready`)
      process.exit(0)
    }
    console.log(`[wait] ${url} answered ${response.status}; retrying`)
  } catch (error) {
    console.log(`[wait] ${url} not reachable yet (${error instanceof Error ? error.message : error}); retrying`)
  }
  await sleep(POLL_INTERVAL_MS)
}

console.error(`[wait] gave up on ${url} after ${timeoutSeconds}s`)
process.exit(1)
