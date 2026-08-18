import { MAX_REPORTS_PER_MINUTE, clientHash, json, parseSaveReport } from "./counter.js"

async function readStats(env) {
  const row = await env.DB.prepare(
    "SELECT total_saved, reports, updated_at FROM rescue_stats WHERE id = 1"
  ).first()
  return {
    totalSaved: Number(row?.total_saved || 0),
    reports: Number(row?.reports || 0),
    updatedAt: row?.updated_at || null
  }
}

async function enforceRateLimit(request, env) {
  const hash = await clientHash(request, env.RATE_LIMIT_SALT)
  const bucket = Math.floor(Date.now() / 60000)
  const row = await env.DB.prepare(`
    INSERT INTO submission_limits (client_hash, minute_bucket, submissions)
    VALUES (?, ?, 1)
    ON CONFLICT(client_hash, minute_bucket)
    DO UPDATE SET submissions = submissions + 1
    RETURNING submissions
  `).bind(hash, bucket).first()
  return Number(row?.submissions || 1) <= MAX_REPORTS_PER_MINUTE
}

async function recordSaves(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: "invalid JSON" }, 400)
  }
  const report = parseSaveReport(body)
  if (!report) return json({ error: "expected an eventId and 1–30 saved agents" }, 400)
  if (!(await enforceRateLimit(request, env))) {
    return json({ error: "too many rescue reports; try again shortly" }, 429, { "retry-after": "60" })
  }

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
