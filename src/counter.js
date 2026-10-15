// A report is a batch of up to five finished levels, and the biggest colony
// is eighteen — more when a level adds colleagues as it goes (the Ice Cave's
// thawed, Model Collapse's copies, up to twelve), which the client covers by
// sealing a batch before it would pass the cap rather than by level count. Clients send one of these per batch
// rather than per level.
export const MAX_SAVED_PER_REPORT = 90
export const MAX_REPORTS_PER_MINUTE = 8
// Rate-limit buckets older than this many minutes are retired, at most
// LIMIT_CLEANUP per charge (see enforceRateLimit in worker.js).
export const LIMIT_KEEP_MINUTES = 5
export const LIMIT_CLEANUP = 64
// A report is about seventy bytes of JSON. Anything near this is not one.
export const MAX_BODY_BYTES = 4096

// The body as text, or null if it is longer than `limit` bytes. A declared
// length over the limit is refused without reading; otherwise the stream is
// counted as it arrives and cancelled the moment it passes the limit, so a
// missing or false Content-Length cannot make the Worker hold a large body.
export async function readCappedBody(request, limit = MAX_BODY_BYTES) {
  const declared = Number(request.headers.get("content-length"))
  if (declared > limit) return null
  if (!request.body) return ""
  const reader = request.body.getReader(), parts = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) { await reader.cancel().catch(() => {}); return null }
    parts.push(value)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const p of parts) { all.set(p, at); at += p.byteLength }
  return new TextDecoder().decode(all)
}

export function parseSaveReport(value) {
  if (!value || typeof value !== "object") return null
  if (!Number.isInteger(value.saved) || value.saved < 1 || value.saved > MAX_SAVED_PER_REPORT) return null
  if (typeof value.eventId !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(value.eventId)) return null
  return { eventId: value.eventId, saved: value.saved }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  })
}

export async function clientHash(request, salt) {
  const address = request.headers.get("CF-Connecting-IP") || "local"
  const bytes = new TextEncoder().encode(`${salt || "local-development"}:${address}`)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
}
