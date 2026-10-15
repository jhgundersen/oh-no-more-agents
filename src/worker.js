import { LIMIT_CLEANUP, LIMIT_KEEP_MINUTES, MAX_BODY_BYTES, MAX_REPORTS_PER_MINUTE, MAX_SAVED_PER_REPORT, clientHash, json, parseSaveReport, readCappedBody } from "./counter.js"
import { BUILD } from "./version.js"

async function readStats(env) {
  const row = await env.DB.prepare(
    "SELECT total_saved, reports, updated_at FROM rescue_stats WHERE id = 1"
  ).first()
  return {
    totalSaved: Number(row?.total_saved || 0),
    reports: Number(row?.reports || 0),
    updatedAt: row?.updated_at || null,
    // The build a fresh load would get. Every reply carries it, so a page left
    // open learns about a deploy on a request it was making anyway.
    build: BUILD
  }
}

// Only the current minute's bucket is ever read, so older ones are dead
// weight. Each charge also retires up to LIMIT_CLEANUP of them (by the bucket
// index), in the same batch, so the table stays about as big as one window of
// active callers instead of growing a row per caller per minute for ever
// (server review 2026-10-15, finding 5). A few minutes are kept so an edge
// whose clock runs slightly behind still finds its count. Only rate-limit
// state goes: rescue_events, which makes a retry idempotent, is untouched.
// (The constants live in counter.js: a Worker module may export only handlers.)

async function enforceRateLimit(request, env) {
  const hash = await clientHash(request, env.RATE_LIMIT_SALT)
  const bucket = Math.floor(Date.now() / 60000)
  const [charged] = await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO submission_limits (client_hash, minute_bucket, submissions)
      VALUES (?, ?, 1)
      ON CONFLICT(client_hash, minute_bucket)
      DO UPDATE SET submissions = submissions + 1
      RETURNING submissions
    `).bind(hash, bucket),
    env.DB.prepare(`
      DELETE FROM submission_limits WHERE rowid IN (
        SELECT rowid FROM submission_limits WHERE minute_bucket < ? LIMIT ?
      )
    `).bind(bucket - LIMIT_KEEP_MINUTES, LIMIT_CLEANUP)
  ])
  const row = charged?.results?.[0]
  return Number(row?.submissions || 1) <= MAX_REPORTS_PER_MINUTE
}

async function recordSaves(request, env) {
  // Bounded before anything else: the body is read to at most MAX_BODY_BYTES
  // and the caller's quota is charged before any parsing, so neither a huge
  // body nor a caller already over its limit costs more than that (server
  // review 2026-10-15, finding 1).
  const text = await readCappedBody(request, MAX_BODY_BYTES)
  if (text === null) return json({ error: `report too large (over ${MAX_BODY_BYTES} bytes)` }, 413)
  if (!(await enforceRateLimit(request, env))) {
    return json({ error: "too many rescue reports; try again shortly" }, 429, { "retry-after": "60" })
  }
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return json({ error: "invalid JSON" }, 400)
  }
  const report = parseSaveReport(body)
  if (!report) return json({ error: `expected an eventId and 1–${MAX_SAVED_PER_REPORT} saved agents` }, 400)

  // D1 batches execute as one transaction. The applied flag makes this safe
  // to retry: an existing event contributes zero on every subsequent batch.
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO rescue_events (event_id, saved, applied) VALUES (?, ?, 0)"
    ).bind(report.eventId, report.saved),
    env.DB.prepare(`
      UPDATE rescue_stats
      SET total_saved = total_saved + COALESCE((
            SELECT saved FROM rescue_events WHERE event_id = ? AND applied = 0
          ), 0),
          reports = reports + CASE WHEN EXISTS(
            SELECT 1 FROM rescue_events WHERE event_id = ? AND applied = 0
          ) THEN 1 ELSE 0 END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).bind(report.eventId, report.eventId),
    env.DB.prepare("UPDATE rescue_events SET applied = 1 WHERE event_id = ?").bind(report.eventId)
  ])

  return json(await readStats(env))
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === "/api/stats" && request.method === "GET") {
      return json(await readStats(env))
    }
    if (url.pathname === "/api/saves" && request.method === "POST") {
      return recordSaves(request, env)
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404)
    return env.ASSETS.fetch(request)
  }
}
