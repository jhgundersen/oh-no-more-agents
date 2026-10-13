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
    async batch(stmts) { log.push(["batch", stmts.length, stmts[0].args]); return [] }
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
