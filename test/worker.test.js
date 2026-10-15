import test from "node:test"
import assert from "node:assert/strict"
import worker from "../src/worker.js"
import { BUILD } from "../src/version.js"
import { MAX_REPORTS_PER_MINUTE } from "../src/counter.js"

// The Worker against an in-memory stand-in for D1: enough of prepare/bind/
// first/batch to run the two routes, and a log of what was asked of it.
function fakeDB({ stats = { total_saved: 41, reports: 3, updated_at: "2026-10-14 00:00:00" }, submissions = 1 } = {}) {
  const log = []
  const db = {
    log,
    prepare(sql) {
      const stmt = {
        sql, args: [],
        bind(...args) { stmt.args = args; return stmt },
        async first() {
          log.push(["first", sql.trim().split(/\s+/)[0]])
          if (/FROM rescue_stats/.test(sql)) return stats
          if (/submission_limits/.test(sql)) return { submissions }
          return null
        }
      }
      return stmt
    },
    async batch(stmts) {
      if (/submission_limits/.test(stmts[0].sql)) { log.push(["limit", stmts.length]); return [{ results: [{ submissions }] }, { results: [] }] }
      log.push(["batch", stmts.length, stmts[0].args]); return []
    }
  }
  return db
}
const env = (db) => ({ DB: db, RATE_LIMIT_SALT: "test", ASSETS: { fetch: async () => new Response("asset") } })
const get = (path) => new Request("https://oh-no-more-agents.com" + path)
const post = (path, body) => new Request("https://oh-no-more-agents.com" + path,
  { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "CF-Connecting-IP": "1.2.3.4" } })

test("GET /api/stats reports the counter and the build, uncached", async () => {
  const res = await worker.fetch(get("/api/stats"), env(fakeDB()))
  assert.equal(res.status, 200)
  assert.equal(res.headers.get("cache-control"), "no-store")
  assert.deepEqual(await res.json(), { totalSaved: 41, reports: 3, updatedAt: "2026-10-14 00:00:00", build: BUILD })
})

test("an empty stats table reads as zero, not as an error", async () => {
  const res = await worker.fetch(get("/api/stats"), env(fakeDB({ stats: null })))
  assert.deepEqual(await res.json(), { totalSaved: 0, reports: 0, updatedAt: null, build: BUILD })
})

test("POST /api/saves records a valid report in one batch and returns the stats", async () => {
  const db = fakeDB()
  const res = await worker.fetch(post("/api/saves", { eventId: "level_42_abcdefghijkl", saved: 17 }), env(db))
  assert.equal(res.status, 200)
  const batch = db.log.find(l => l[0] === "batch")
  assert.ok(batch, "one batch")
  assert.equal(batch[1], 3)
  assert.deepEqual(batch[2], ["level_42_abcdefghijkl", 17])
  assert.equal((await res.json()).totalSaved, 41)
})

test("bad reports are refused before anything is written", async () => {
  for (const body of ["{not json", { eventId: "short", saved: 1 }, { eventId: "level_42_abcdefghijkl", saved: 0 }]) {
    const db = fakeDB()
    const res = await worker.fetch(post("/api/saves", body), env(db))
    assert.equal(res.status, 400)
    assert.ok(!db.log.some(l => l[0] === "batch"))
  }
})

test("over the rate limit is a 429 with retry-after, and nothing is written", async () => {
  const db = fakeDB({ submissions: MAX_REPORTS_PER_MINUTE + 1 })
  const res = await worker.fetch(post("/api/saves", { eventId: "level_42_abcdefghijkl", saved: 3 }), env(db))
  assert.equal(res.status, 429)
  assert.equal(res.headers.get("retry-after"), "60")
  assert.ok(!db.log.some(l => l[0] === "batch"))
})

test("unknown API paths are 404 and everything else is a static asset", async () => {
  assert.equal((await worker.fetch(get("/api/nope"), env(fakeDB()))).status, 404)
  assert.equal((await worker.fetch(new Request("https://x/api/stats", { method: "DELETE" }), env(fakeDB()))).status, 404)
  assert.equal(await (await worker.fetch(get("/"), env(fakeDB()))).text(), "asset")
})

// A body handed over in chunks, with no Content-Length, that counts what is
// pulled from it and whether it was cancelled.
function streamed(chunks) {
  const enc = new TextEncoder(), state = { pulled: 0, cancelled: false }
  let i = 0
  const body = new ReadableStream({
    pull(c) { if (i < chunks.length) { const b = enc.encode(chunks[i++]); state.pulled += b.byteLength; c.enqueue(b) } else c.close() },
    cancel() { state.cancelled = true }
  })
  return { state, request: new Request("https://oh-no-more-agents.com/api/saves", { method: "POST", body, duplex: "half", headers: { "CF-Connecting-IP": "1.2.3.4" } }) }
}

test("a report body is capped at MAX_BODY_BYTES: small ones pass, big ones are 413 without being read to the end", async () => {
  const { MAX_BODY_BYTES } = await import("../src/counter.js")
  assert.equal(MAX_BODY_BYTES, 4096)
  const ok = await worker.fetch(post("/api/saves", { eventId: "level_42_abcdefghijkl", saved: 3, pad: "x".repeat(3500) }), env(fakeDB()))
  assert.equal(ok.status, 200, "a padded but small report still goes through")
  const db = fakeDB()
  const big = await worker.fetch(post("/api/saves", { eventId: "level_42_abcdefghijkl", saved: 3, pad: "x".repeat(2 * 1024 * 1024) }), env(db))
  assert.equal(big.status, 413)
  assert.equal(db.log.length, 0, "refused before the quota or anything else")
  // Chunked, no Content-Length: read only until the cap, then cancelled.
  const s = streamed(Array.from({ length: 512 }, () => "x".repeat(4096)))
  const res = await worker.fetch(s.request, env(fakeDB()))
  assert.equal(res.status, 413)
  assert.ok(s.state.pulled <= 4096 * 3, `pulled ${s.state.pulled} bytes of 2 MiB`)
  assert.equal(s.state.cancelled, true)
  // A declared length over the cap is refused without reading the body at all.
  const d = streamed(["{}"])
  const declared = new Request(d.request, { headers: { "content-length": "999999", "CF-Connecting-IP": "1.2.3.4" } })
  assert.equal((await worker.fetch(declared, env(fakeDB()))).status, 413)
})

test("over the quota, an oversized body is still refused at the cap, and a bad one is charged to the quota first", async () => {
  const db = fakeDB({ submissions: MAX_REPORTS_PER_MINUTE + 1 })
  const s = streamed(Array.from({ length: 512 }, () => "x".repeat(4096)))
  assert.equal((await worker.fetch(s.request, env(db))).status, 413)
  assert.ok(s.state.pulled <= 4096 * 3)
  const over = fakeDB({ submissions: MAX_REPORTS_PER_MINUTE + 1 })
  assert.equal((await worker.fetch(post("/api/saves", "{not json"), env(over))).status, 429, "the quota is checked before parsing")
})
