export const MAX_SAVED_PER_REPORT = 30
export const MAX_REPORTS_PER_MINUTE = 8

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
